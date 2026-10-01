import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { makeCtx } from "./helpers.ts"

const now = new Date("2026-09-30T12:30:00Z")

describe("GET /districts", () => {
  it("lists districts with the teaching notice", () => {
    const res = handle("GET", "/districts", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: NOTICE })
    expect((res.body as { districts: unknown[] }).districts.length).toBe(12)
  })
})

describe("GET /districts/:id", () => {
  it("shows the latest station reading in Bangkok time", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      district: { id: "lat-phrao", nameTh: "ลาดพร้าว" },
      stations: [{ id: "st-ladprao-01", latest: { at: "2026-09-30T19:00:00+07:00", levelCm: 104 } }]
    })
  })

  it("ignores readings after now", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now: new Date("2026-09-30T10:30:00Z") })
    expect(res.body).toMatchObject({ stations: [{ latest: { levelCm: 88 } }] })
  })

  it("returns an empty station list for a district with no stations", () => {
    const res = handle("GET", "/districts/sai-mai", undefined, { now })
    expect(res.body).toMatchObject({ stations: [] })
  })

  it("returns 404 for an unknown district", () => {
    expect(handle("GET", "/districts/atlantis", undefined, { now }).status).toBe(404)
  })
})

describe("unknown routes", () => {
  it("returns 404", () => {
    expect(handle("GET", "/nope", undefined, { now }).status).toBe(404)
  })
})

describe("RPT-REQ-020 existing endpoints do not change", () => {
  it("GET /districts body is unchanged", () => {
    expect(handle("GET", "/districts", undefined, makeCtx()).body).toMatchSnapshot()
  })

  it("GET /districts/:id only adds reportNotice and reports", () => {
    const body = handle("GET", "/districts/lat-phrao", undefined, makeCtx()).body as object
    expect(Object.keys(body).sort()).toEqual(["district", "notice", "reportNotice", "reports", "stations"])
  })

  it("adds no runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Record<string, unknown>
    expect(pkg.dependencies ?? {}).toEqual({})
  })
})
