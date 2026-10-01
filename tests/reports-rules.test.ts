import { describe, expect, it } from "vitest"
import { ReportStore, severityFor, validateReport } from "../src/reports.ts"

const t = (hhmm: string) => new Date(`2026-09-30T${hhmm}:00Z`)
const input = { districtId: "lat-phrao", landmark: "ซอยลาดพร้าว 71", depthCm: 25, seenAt: t("11:50") }

describe("severity boundaries (W6, RPT-REQ-002)", () => {
  it.each([
    [10, 1],
    [11, 2],
    [30, 2],
    [31, 3],
    [50, 3],
    [51, 4]
  ])("%i cm is level %i", (depthCm, level) => {
    expect(severityFor(depthCm)).toBe(level)
  })
})

describe("duplicate reports (W6, RPT-REQ-004)", () => {
  it("merges the same spot within 2 hours, keeping the latest depth", () => {
    const store = new ReportStore()
    store.submit(input, t("12:00"))
    const { report, merged } = store.submit({ ...input, landmark: "  ซอยลาดพร้าว   71 ", depthCm: 12 }, t("14:00"))
    expect(merged).toBe(true)
    expect(report).toMatchObject({ confirmations: 2, depthCm: 12, severity: 2 })
    expect(store.active("lat-phrao", t("14:00"))).toHaveLength(1)
  })

  it("creates a new report just over 2 hours after the last confirmation", () => {
    const store = new ReportStore()
    store.submit(input, t("12:00"))
    expect(store.submit(input, new Date("2026-09-30T14:00:01Z")).merged).toBe(false)
  })

  it("does not merge the same landmark in another district", () => {
    const store = new ReportStore()
    store.submit(input, t("12:00"))
    expect(store.submit({ ...input, districtId: "chatuchak" }, t("12:05")).merged).toBe(false)
  })
})

describe("expiry (W6, RPT-REQ-005)", () => {
  it("hides a report 6 hours after its last confirmation", () => {
    const store = new ReportStore()
    store.submit(input, t("12:00"))
    expect(store.active("lat-phrao", t("18:00"))).toHaveLength(1)
    expect(store.active("lat-phrao", new Date("2026-09-30T18:00:01Z"))).toHaveLength(0)
  })
})

describe("validateReport (RPT-REQ-003)", () => {
  const now = t("12:00")
  const ok = { districtId: "lat-phrao", landmark: "ซอยลาดพร้าว 71", depthCm: 25, seenAt: "2026-09-30T11:50:00Z" }

  it("accepts a valid report, with or without a phone", () => {
    expect(validateReport(ok, now).ok).toBe(true)
    expect(validateReport({ ...ok, phone: "0812345678" }, now).ok).toBe(true)
  })

  it.each([
    ["unknown district", { ...ok, districtId: "atlantis" }],
    ["landmark too short", { ...ok, landmark: " x " }],
    ["depth not whole", { ...ok, depthCm: 12.5 }],
    ["depth zero", { ...ok, depthCm: 0 }],
    ["depth too deep", { ...ok, depthCm: 301 }],
    ["seenAt not a date", { ...ok, seenAt: "yesterday" }],
    ["seenAt in the future", { ...ok, seenAt: "2026-09-30T12:10:00Z" }],
    ["seenAt too old", { ...ok, seenAt: "2026-09-30T05:59:00Z" }],
    ["bad phone", { ...ok, phone: "12345" }]
  ])("rejects %s", (_name, body) => {
    expect(validateReport(body, now).ok).toBe(false)
  })
})
