"use strict"

// Page logic for the map page, with no DOM and no map: sort, count, place, and wording.
// A plain script that sets one global, so tests can load it in a VM.
;(() => {
  // Same order and ids as SEVERITY_LEVELS in src/reports.ts (RPT-REQ-009), shallow to deep.
  const LEVELS = ["wet", "hard-for-small-cars", "unsafe-for-small-cars", "dangerous"]
  // Where a หมุด goes when its เขต has no กึ่งกลางเขต (should not happen; keeps the page drawing).
  const FALLBACK_CENTRE = [100.6, 13.78]
  const MINUTE = 60 * 1000

  /** Minutes between a +07:00 seenAt from the API and `nowMs`, never below 0. */
  const minutesAgo = (seenAt, nowMs) => Math.max(0, Math.floor((nowMs - Date.parse(seenAt)) / MINUTE))

  const ageLabel = (m) => (m < 1 ? "เห็นเมื่อสักครู่" : m < 60 ? `เห็นเมื่อ ${m} นาทีก่อน` : `เห็นเมื่อ ${Math.floor(m / 60)} ชั่วโมงก่อน`)

  /** Bangkok time as `YYYY-MM-DDTHH:MM:SS+07:00`, the format the API uses. */
  const bangkokIso = (ms) => new Date(ms + 7 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+07:00")

  /** "2026-09-30T19:00:00+07:00" -> "19:00 น." The API already sends Bangkok time. */
  const clock = (iso) => (typeof iso === "string" && iso.length >= 16 ? `${iso.slice(11, 16)} น.` : "")

  /** Deepest first, then newest seenAt first, then id. seenAt always carries +07:00, so it sorts as text. */
  function bySeverity(a, b) {
    const byLevel = LEVELS.indexOf(b.severity.level) - LEVELS.indexOf(a.severity.level)
    if (byLevel !== 0) return byLevel
    if (a.seenAt !== b.seenAt) return a.seenAt < b.seenAt ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }

  const inFilter = (filter) => (item) => filter === "all" || item.districtId === filter

  /** How many รายงาน per severity level, for the current เขต filter. */
  function countBySeverity(reports, filter) {
    const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]))
    for (const r of reports.filter(inFilter(filter))) if (Object.hasOwn(counts, r.severity.level)) counts[r.severity.level] += 1
    return counts
  }

  /** How many รายงาน per เขต, for the filter chips. */
  function countByDistrict(reports) {
    const counts = {}
    for (const r of reports) counts[r.districtId] = (counts[r.districtId] ?? 0) + 1
    return counts
  }

  const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) >>> 0, 7)

  /** A stable spot near the กึ่งกลางเขต for a เขต + จุดสังเกต, so a merged รายงาน keeps one หมุด. */
  function place(centres, districtId, key) {
    const [lon, lat] = centres[districtId] ?? FALLBACK_CENTRE
    const h = hash(districtId + key)
    const angle = ((h % 360) * Math.PI) / 180
    const radius = 0.004 + ((h >>> 9) % 80) / 10000
    return [lon + Math.cos(angle) * radius, lat + Math.sin(angle) * radius]
  }

  /** Where an item's หมุด goes: a station at its กึ่งกลางเขต, a รายงาน near it. */
  const positionOf = (item, centres) =>
    item.kind === "station" ? centres[item.districtId] ?? FALLBACK_CENTRE : place(centres, item.districtId, item.landmark.toLowerCase())

  window.NAMTUAM_LOGIC = { LEVELS, minutesAgo, ageLabel, bangkokIso, clock, bySeverity, inFilter, countBySeverity, countByDistrict, place, positionOf }
})()
