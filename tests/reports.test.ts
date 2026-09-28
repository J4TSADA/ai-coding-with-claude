import { describe, expect, it } from "vitest"
import { ReportStore, severityFor } from "../src/reports.ts"

const now = new Date("2026-09-30T12:00:00Z")
const input = { districtId: "lat-phrao", landmark: "ซอยลาดพร้าว 71", depthCm: 25, seenAt: new Date("2026-09-30T11:50:00Z") }

describe("severityFor (RPT-REQ-002)", () => {
  it.each([
    [5, 1],
    [20, 2],
    [40, 3],
    [80, 4]
  ])("%i cm is level %i", (depthCm, level) => {
    expect(severityFor(depthCm)).toBe(level)
  })
})

describe("ReportStore", () => {
  it("stores a new report with one confirmation (RPT-REQ-001)", () => {
    const store = new ReportStore()
    const { report, merged } = store.submit(input, now)
    expect(merged).toBe(false)
    expect(report).toMatchObject({ districtId: "lat-phrao", depthCm: 25, severity: 2, confirmations: 1 })
  })

  it("lists the most severe reports first (RPT-REQ-006)", () => {
    const store = new ReportStore()
    store.submit({ ...input, landmark: "แยกรัชโยธิน", depthCm: 8 }, now)
    store.submit({ ...input, landmark: "ซอยลาดพร้าว 71", depthCm: 55 }, now)
    expect(store.active("lat-phrao", now).map((r) => r.severity)).toEqual([4, 1])
  })
})
