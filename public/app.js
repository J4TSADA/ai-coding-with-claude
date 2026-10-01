"use strict"

// Map page for the read-only demo. Talks only to this site (same origin) and only with GET.
// Every piece of text that came from a user goes into the page with textContent, never as markup.
;(() => {
  const REFRESH_MS = 60 * 1000
  const TILES_URL = "/tiles/bangkok.pmtiles"
  const BOUNDS = [[100.3, 13.5], [100.95, 14.05]]
  // กึ่งกลางเขต [lon, lat] by district id, from GET /api/centres. The API stores no coordinates
  // for reports, so pins sit near these points. Approximate on purpose.
  let CENTRES = {}

  // DOM-free logic (sort, count, place, wording) lives in logic.js so it can be tested.
  const L = window.NAMTUAM_LOGIC

  const state = { districts: [], stations: [], reports: [], filter: "all", selected: null }
  const pins = new Map()
  let map = null
  let hasTiles = false
  let firstRender = true
  let popup = null
  let onPopupClose = null

  const SVG_NS = "http://www.w3.org/2000/svg"
  /** Small inline icon from path data we write ourselves (never from user input). */
  function icon(d) {
    const svg = document.createElementNS(SVG_NS, "svg")
    svg.setAttribute("viewBox", "0 0 20 20")
    svg.setAttribute("aria-hidden", "true")
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", d)
    path.setAttribute("fill", "none")
    path.setAttribute("stroke", "currentColor")
    path.setAttribute("stroke-width", "1.7")
    path.setAttribute("stroke-linecap", "round")
    path.setAttribute("stroke-linejoin", "round")
    svg.append(path)
    return svg
  }
  const ICON_PEOPLE = "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4.5 7c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M13.5 9a2 2 0 1 0 0-4M14 11.6c1.9.4 3.5 2.1 3.5 4.4"
  const ICON_DROP = "M10 2.5c3.2 4 5.2 6.8 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-2.4 2-5.2 5.2-9.2Z"

  const $ = (id) => document.getElementById(id)
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = String(text)
    return node
  }

  const positionOf = (item) => L.positionOf(item, CENTRES)
  const ageOf = (r) => L.ageLabel(L.minutesAgo(r.seenAt, Date.now()))

  async function getJson(path) {
    const res = await fetch(path, { headers: { accept: "application/json" } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  async function load() {
    const [list, centres] = await Promise.all([getJson("/districts"), getJson("/api/centres")])
    if (list.notice) $("notice").textContent = list.notice
    state.districts = list.districts
    CENTRES = centres.centres
    const details = await Promise.all(state.districts.map((d) => getJson(`/districts/${encodeURIComponent(d.id)}`)))
    const stations = []
    const reports = []
    details.forEach((body, i) => {
      const d = state.districts[i]
      if (body.reportNotice) $("report-notice").textContent = body.reportNotice
      for (const s of body.stations) if (s.latest) stations.push({ ...s, kind: "station", key: `st:${s.id}`, districtId: d.id, districtName: d.nameTh })
      for (const r of body.reports) reports.push({ ...r, kind: "report", key: r.id, districtName: d.nameTh })
    })
    state.stations = stations
    state.reports = reports.sort(L.bySeverity)
    if (state.selected && !findItem(state.selected)) {
      state.selected = null
      closePopup()
    }
    render()
  }

  const findItem = (key) => [...state.reports, ...state.stations].find((x) => x.key === key)
  const inFilter = (item) => L.inFilter(state.filter)(item)

  const confirmText = (n) => (n > 1 ? `ยืนยัน ${n} คน` : "รายงาน 1 คน")
  const depthText = (r) => `${r.severity.labelTh} · ลึก ${r.depthCm} ซม.`

  /** A small staff gauge filled to the severity level. Colour and text always go together. */
  function staff(level) {
    const gauge = el("span", `staff ${level}`)
    gauge.setAttribute("aria-hidden", "true")
    gauge.append(el("i"))
    return gauge
  }

  function renderSummary() {
    const counts = L.countBySeverity(state.reports, state.filter)
    for (const level of L.LEVELS) {
      $("summary").querySelector(`.tile.${level} b`).textContent = String(counts[level])
    }
    $("updated").textContent = `อัปเดต ${L.clock(L.bangkokIso(Date.now()))}`
  }

  function renderFilters() {
    const counts = L.countByDistrict(state.reports)
    const options = [["all", "ทุกเขต", state.reports.length], ...state.districts.map((d) => [d.id, d.nameTh, counts[d.id] ?? 0])]
    $("filters").replaceChildren(
      ...options.map(([id, name, n]) => {
        const b = el("button", "chip", name)
        b.type = "button"
        if (n) b.append(el("b", null, String(n)))
        b.setAttribute("aria-pressed", String(state.filter === id))
        b.addEventListener("click", () => {
          state.filter = id
          render()
          if (id !== "all" && map && CENTRES[id]) map.flyTo({ center: CENTRES[id], zoom: 12.5 })
        })
        return b
      })
    )
  }

  function renderList() {
    const visible = state.reports.filter(inFilter)
    $("count").textContent = visible.length ? `· ${visible.length}` : ""
    const list = $("incidents")
    if (!visible.length) {
      const empty = el("li", "empty")
      empty.append(icon(ICON_DROP), el("span", null, "ยังไม่มีรายงานในช่วง 6 ชั่วโมงที่ผ่านมา"))
      list.replaceChildren(empty)
      return
    }
    list.replaceChildren(
      ...visible.map((r) => {
        const li = el("li")
        const b = el("button", "incident")
        b.type = "button"
        b.setAttribute("aria-current", String(state.selected === r.key))

        const info = el("div", "body")
        const title = el("div", "title")
        title.append(el("span", "landmark", r.landmark))
        const meta = el("div", "meta")
        meta.append(el("span", "depth-label", depthText(r)), el("span", "dot"), el("span", null, `เขต${r.districtName}`))
        const foot = el("div", "foot")
        const confirm = el("span", "confirm")
        confirm.append(icon(ICON_PEOPLE), confirmText(r.confirmations))
        foot.append(el("span", null, ageOf(r)), confirm, el("span", "user-label", r.disclaimer))
        info.append(title, meta, foot)

        b.append(staff(r.severity.level), info)
        b.addEventListener("click", () => select(r.key, true))
        li.append(b)
        return li
      })
    )
    // Stagger the cards in on the first render only; refreshes should not replay it.
    if (firstRender) {
      firstRender = false
      list.classList.add("intro")
      setTimeout(() => list.classList.remove("intro"), 900)
    }
  }

  function renderPins() {
    if (!map) return
    for (const { marker } of pins.values()) marker.remove()
    pins.clear()
    // Deepest last, so it is drawn on top.
    const items = [...state.stations.filter(inFilter), ...[...state.reports].reverse().filter(inFilter)]
    for (const item of items) {
      const b = el("button", "pin")
      b.type = "button"
      if (item.kind === "station") {
        b.classList.add("pin-station")
        b.setAttribute("aria-label", `สถานีวัด ${item.nameTh} ${item.latest.levelCm} เซนติเมตร`)
      } else {
        b.classList.add("pin-report", item.severity.level)
        b.title = item.landmark
        if (item.confirmations > 1) b.append(el("span", null, String(Math.min(item.confirmations, 99))))
        b.setAttribute("aria-label", `${item.landmark} ${item.severity.labelTh} ลึก ${item.depthCm} เซนติเมตร ${ageOf(item)} ยืนยัน ${item.confirmations} คน`)
      }
      if (state.selected === item.key) b.classList.add("selected")
      b.addEventListener("click", (e) => {
        e.stopPropagation()
        select(item.key, false)
      })
      const marker = new maplibregl.Marker({ element: b, anchor: "center" }).setLngLat(positionOf(item)).addTo(map)
      pins.set(item.key, { marker, el: b })
    }
  }

  function popupContent(item) {
    const box = el("div", "popup")
    if (item.kind === "station") {
      const reading = el("div", "reading", String(item.latest.levelCm))
      reading.append(el("small", null, "ซม."))
      box.append(
        el("span", "kind", `สถานีวัดระดับน้ำ · เขต${item.districtName}`),
        el("span", "landmark", item.nameTh),
        reading,
        el("span", "meta", `วัดเมื่อ ${L.clock(item.latest.at)} · ข้อมูลสมมติ`)
      )
      return box
    }
    const head = el("div", "title")
    head.append(staff(item.severity.level), el("span", "landmark", item.landmark))
    const meta = el("div", "meta")
    meta.append(el("span", "depth-label", depthText(item)), el("span", "dot"), el("span", null, ageOf(item)))
    const confirm = el("span", "confirm")
    confirm.append(icon(ICON_PEOPLE), confirmText(item.confirmations))
    const foot = el("div", "foot")
    foot.append(confirm, el("span", null, "ตำแหน่งโดยประมาณ"))
    box.append(el("span", "kind", `${item.disclaimer} · เขต${item.districtName}`), head, meta, foot)
    return box
  }

  /** Close the popup without its close handler, so re-selecting the same pin keeps it selected. */
  function closePopup() {
    if (!popup) return
    popup.off("close", onPopupClose)
    popup.remove()
    popup = null
  }

  function select(key, fly) {
    const item = findItem(key)
    state.selected = item ? key : null
    renderList()
    for (const [k, { el: pinEl }] of pins) pinEl.classList.toggle("selected", k === state.selected)
    if (!item || !map) return
    const at = positionOf(item)
    closePopup()
    popup = new maplibregl.Popup({ offset: item.kind === "station" ? 12 : 20, maxWidth: "280px" }).setLngLat(at).setDOMContent(popupContent(item)).addTo(map)
    // Closed by the user (x button or a click on the map): clear the selection.
    onPopupClose = () => {
      popup = null
      state.selected = null
      renderList()
      pins.get(key)?.el.classList.remove("selected")
    }
    popup.on("close", onPopupClose)
    if (fly) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13) })
  }

  function render() {
    renderSummary()
    renderFilters()
    renderList()
    renderPins()
  }

  function showStatus(text) {
    $("map-status").textContent = text
    $("map-status").hidden = !text
  }

  let toastTimer = 0
  function toast(text) {
    $("toast").textContent = text
    $("toast").hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4000)
  }

  const dark = () => !window.matchMedia("(prefers-color-scheme: light)").matches
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  function blankStyle() {
    return { version: 8, sources: {}, layers: [{ id: "land", type: "background", paint: { "background-color": cssVar("--land") } }] }
  }

  function basemapStyle() {
    const flavor = dark() ? "dark" : "light"
    // Thai labels. The italic face has no Thai glyphs, so water names use the regular face.
    const layers = basemaps.layers("protomaps", basemaps.namedFlavor(flavor), { lang: "th" }).map((layer) => {
      const font = layer.layout && layer.layout["text-font"]
      if (Array.isArray(font)) layer.layout["text-font"] = font.map((f) => (f === "Noto Sans Italic" ? "Noto Sans Regular" : f))
      return layer
    })
    return {
      version: 8,
      // Self-hosted (ADR 0001, scripts/vendor-map.sh). MapLibre wants absolute URLs here, like the tiles.
      glyphs: `${location.origin}/vendor/glyphs/{fontstack}/{range}.pbf`,
      sprite: `${location.origin}/vendor/sprites/${flavor}`,
      sources: {
        protomaps: {
          type: "vector",
          url: `pmtiles://${location.origin}${TILES_URL}`,
          attribution: "<a href=\"https://openstreetmap.org/copyright\">© OpenStreetMap</a> · <a href=\"https://protomaps.com\">Protomaps</a>"
        }
      },
      layers
    }
  }

  /**
   * Glyph folders on disk have no spaces ("noto-sans-regular"), but MapLibre asks for the font stack
   * name ("Noto%20Sans%20Regular"). Static hosting serves files as they are, so rewrite the URL here.
   */
  function transformRequest(url, resourceType) {
    if (resourceType !== "Glyphs") return { url }
    return { url: url.replace(/\/glyphs\/Noto%20Sans%20(Regular|Medium)\//, (_m, face) => `/glyphs/noto-sans-${face.toLowerCase()}/`) }
  }

  async function initMap() {
    if (!window.maplibregl || !window.pmtiles || !window.basemaps) {
      showStatus("โหลดตัวแผนที่ไม่ได้ ยังดูรายการจุดได้ตามปกติ")
      return
    }
    const protocol = new pmtiles.Protocol()
    maplibregl.addProtocol("pmtiles", protocol.tile)
    map = new maplibregl.Map({
      container: "map",
      style: blankStyle(),
      center: [100.6, 13.8],
      zoom: 10.3,
      maxBounds: BOUNDS,
      attributionControl: { compact: true },
      transformRequest
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // The tiles file is not in git. Without it the map still shows pins on a plain background.
    try {
      const probe = await fetch(TILES_URL, { headers: { range: "bytes=0-126" } })
      hasTiles = probe.status === 206 || probe.status === 200
      if (hasTiles) applyStyle()
      else showStatus("ยังไม่มีไฟล์แผนที่พื้นหลัง หมุดยังดูได้ตามปกติ")
    } catch {
      showStatus("โหลดแผนที่พื้นหลังไม่ได้ หมุดยังดูได้ตามปกติ")
    }
    // Follow the system theme.
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyStyle)
  }

  function applyStyle() {
    if (!map) return
    map.setStyle(hasTiles ? basemapStyle() : blankStyle(), { diff: false })
  }

  async function refresh() {
    try {
      await load()
      if (state.selected) select(state.selected, false)
    } catch {
      toast("โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง")
    }
  }

  initMap().finally(() => {
    refresh()
    setInterval(() => {
      if (!document.hidden) refresh()
    }, REFRESH_MS)
  })
})()
