import { NOTICE } from "./app.ts"
import { REPORT_NOTICE } from "./reports.ts"

/** The demo's one page (UI-REQ-001, 003). Both notices are in the HTML itself, so they show without JavaScript. */
export const PAGE_HTML = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>น้ำท่วมไหม</title>
<link rel="stylesheet" href="/app.css">
<script src="/app.js" defer></script>
</head>
<body>
<header>
  <h1>น้ำท่วมไหม</h1>
  <p class="notice" role="note">${NOTICE}</p>
</header>
<main>
  <label for="district">เลือกเขต</label>
  <select id="district" disabled><option>กำลังโหลด…</option></select>
  <p id="status" role="status"></p>

  <section aria-labelledby="stations-title">
    <h2 id="stations-title">สถานีวัดระดับน้ำ</h2>
    <ul id="stations" class="cards"></ul>
  </section>

  <section aria-labelledby="reports-title">
    <h2 id="reports-title">รายงานจากคนในพื้นที่</h2>
    <p class="report-notice" role="note">${REPORT_NOTICE}</p>
    <ul id="reports" class="cards"></ul>
  </section>
</main>
<footer><a href="/api">API</a></footer>
</body>
</html>
`

export const APP_CSS = `:root {
  color-scheme: light dark;
  --bg: #f6f7f9; --card: #fff; --text: #1b1f24; --muted: #5b6470; --line: #dde1e6;
  --warn-bg: #fff4d6; --warn-text: #6b4a00;
  --wet: #2f6fb3; --hard: #b07800; --unsafe: #c4520f; --danger: #b3261e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171b; --card: #1e2227; --text: #e8eaed; --muted: #a0a8b3; --line: #343a42;
    --warn-bg: #3a2f12; --warn-text: #f3d48a;
    --wet: #7fb3ea; --hard: #e5b84c; --unsafe: #f09a5c; --danger: #f28b82;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.6 system-ui, "Noto Sans Thai", "Leelawadee UI", sans-serif;
}
header, main, footer { max-width: 40rem; margin: 0 auto; padding: 0 16px; }
header { padding-top: 24px; }
h1 { margin: 0 0 8px; font-size: 1.75rem; }
h2 { margin: 28px 0 8px; font-size: 1.15rem; }
.notice, .report-notice {
  margin: 0 0 12px; padding: 10px 12px; border-radius: 8px;
  background: var(--warn-bg); color: var(--warn-text); font-size: 0.9rem;
}
label { display: block; margin-top: 16px; font-weight: 600; }
select {
  width: 100%; margin-top: 4px; padding: 10px; font: inherit; color: inherit;
  background: var(--card); border: 1px solid var(--line); border-radius: 8px;
}
#status { min-height: 1.6em; margin: 8px 0 0; color: var(--muted); }
.cards { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 12px 14px; border-left-width: 5px;
}
.card .title { font-weight: 600; overflow-wrap: anywhere; }
.card .meta { color: var(--muted); font-size: 0.9rem; }
.badge { display: inline-block; margin-right: 6px; font-weight: 700; }
.level-wet { border-left-color: var(--wet); } .level-wet .badge { color: var(--wet); }
.level-hard-for-small-cars { border-left-color: var(--hard); } .level-hard-for-small-cars .badge { color: var(--hard); }
.level-unsafe-for-small-cars { border-left-color: var(--unsafe); } .level-unsafe-for-small-cars .badge { color: var(--unsafe); }
.level-dangerous { border-left-color: var(--danger); } .level-dangerous .badge { color: var(--danger); }
.label { display: inline-block; margin-top: 4px; font-size: 0.8rem; color: var(--muted); }
.empty { color: var(--muted); }
footer { padding-top: 32px; padding-bottom: 32px; font-size: 0.9rem; }
footer a { color: var(--muted); }
`

/**
 * Runs in the browser. GET only (UI-REQ-007). Data from the API goes in through
 * textContent and createElement only, never as HTML (UI-REQ-005).
 */
export const APP_JS = `"use strict"
const LOAD_ERROR = "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง"
const select = document.getElementById("district")
const statusLine = document.getElementById("status")
const stationList = document.getElementById("stations")
const reportList = document.getElementById("reports")

async function getJson(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error("HTTP " + res.status)
  return res.json()
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = String(text)
  return node
}

/** "2026-09-30T19:00:00+07:00" -> "19:00 น." The API already sends Bangkok time. */
function clock(iso) {
  return typeof iso === "string" && iso.length >= 16 ? iso.slice(11, 16) + " น." : ""
}

function empty(list, text) {
  list.replaceChildren(el("li", "empty", text))
}

function renderStations(stations) {
  if (stations.length === 0) return empty(stationList, "ไม่มีสถานีในเขตนี้")
  stationList.replaceChildren(...stations.map((s) => {
    const li = el("li", "card")
    li.append(el("div", "title", s.nameTh))
    li.append(el("div", "meta", s.latest
      ? "ระดับน้ำ " + s.latest.levelCm + " ซม. · " + clock(s.latest.at)
      : "ยังไม่มีข้อมูล"))
    return li
  }))
}

function renderReports(reports) {
  if (reports.length === 0) return empty(reportList, "ยังไม่มีรายงานในเขตนี้")
  reportList.replaceChildren(...reports.map((r) => {
    const li = el("li", "card level-" + r.severity.level)
    li.append(el("div", "title", r.landmark))
    const meta = el("div", "meta")
    meta.append(el("span", "badge", r.severity.labelTh))
    meta.append(document.createTextNode(
      "ลึก " + r.depthCm + " ซม. · เห็นเมื่อ " + clock(r.seenAt) + " · ยืนยัน " + r.confirmations + " คน"))
    li.append(meta)
    li.append(el("span", "label", r.disclaimer))
    return li
  }))
}

async function showDistrict(id) {
  statusLine.textContent = "กำลังโหลด…"
  try {
    const data = await getJson("/districts/" + encodeURIComponent(id))
    if (select.value !== id) return // the user picked another district meanwhile
    renderStations(data.stations)
    renderReports(data.reports)
    statusLine.textContent = ""
  } catch {
    stationList.replaceChildren()
    reportList.replaceChildren()
    statusLine.textContent = LOAD_ERROR
  }
}

async function start() {
  let districts
  try {
    districts = (await getJson("/districts")).districts
  } catch {
    statusLine.textContent = LOAD_ERROR
    return
  }
  select.replaceChildren(...districts.map((d) => {
    const option = el("option", "", d.nameTh)
    option.value = d.id
    return option
  }))
  const ids = districts.map((d) => d.id)
  const wanted = new URLSearchParams(location.search).get("district")
  select.value = ids.includes(wanted) ? wanted : ids[0]
  select.disabled = false
  select.addEventListener("change", () => {
    const url = new URL(location.href)
    url.searchParams.set("district", select.value)
    history.replaceState(null, "", url)
    showDistrict(select.value)
  })
  showDistrict(select.value)
}

start()
`
