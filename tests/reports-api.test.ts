import { describe, expect, it } from "vitest"
import { createApp, REPORT_NOTICE } from "../src/app.ts"

const now = new Date("2026-09-30T12:00:00Z")
const body = { districtId: "lat-phrao", landmark: "ซอยลาดพร้าว 71", depthCm: 25, seenAt: "2026-09-30T18:50:00+07:00" }

describe("POST /reports (RPT-REQ-001)", () => {
  it("accepts a report and returns its severity", () => {
    const app = createApp()
    const res = app("POST", "/reports", body, { now })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      notice: REPORT_NOTICE,
      merged: false,
      report: { id: "r1", severity: 2, severityLabel: "รถเล็กผ่านยาก", confirmations: 1, seenAt: "2026-09-30T18:50:00+07:00" }
    })
  })

  it("returns 400 for a body of the wrong shape", () => {
    expect(createApp()("POST", "/reports", { districtId: "lat-phrao" }, { now }).status).toBe(400)
  })
})

describe("GET /districts/:id/reports (RPT-REQ-006, RPT-REQ-009)", () => {
  it("lists a district's reports with the user-report notice", () => {
    const app = createApp()
    app("POST", "/reports", body, { now })
    const res = app("GET", "/districts/lat-phrao/reports", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: REPORT_NOTICE, reports: [{ landmark: "ซอยลาดพร้าว 71" }] })
  })

  it("returns 404 for an unknown district", () => {
    expect(createApp()("GET", "/districts/atlantis/reports", undefined, { now }).status).toBe(404)
  })
})
