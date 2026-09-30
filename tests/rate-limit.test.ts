import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { createRateLimiter, ipKey, REPORT_RATE_LIMIT } from "../src/rate-limit.ts"
import { REPORT_NOTICE } from "../src/reports.ts"
import { makeCtx, now } from "./helpers.ts"

const PATH = "/districts/lat-phrao/reports"
const validBody = () => ({ landmark: "หน้าปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T19:00:00+07:00" })
const at = (ms: number) => new Date(now.getTime() + ms)
const TEN_MIN = 10 * 60 * 1000

type Ctx = ReturnType<typeof makeCtx>
const postTimes = (ctx: Ctx, times: number, body: unknown = validBody()) =>
  Array.from({ length: times }, () => handle("POST", PATH, body, ctx).status)
const stored = (ctx: Ctx) => ctx.reports!.listByDistrict("lat-phrao", ctx.now).length

describe("RPT-REQ-014 5 submissions per 10 minutes per IP", () => {
  it("the 6th gets 429 with retryAfterSeconds 600 and stores nothing", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    expect(postTimes(ctx, 5)).toEqual([201, 201, 201, 201, 201])
    const res = handle("POST", PATH, validBody(), ctx)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: "too many reports", retryAfterSeconds: 600, notice: NOTICE, reportNotice: REPORT_NOTICE })
    expect(stored(ctx)).toBe(5)
  })

  it("exactly now + 10 min is allowed, 1 ms before is 429 with retryAfterSeconds 1", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    postTimes(ctx, 5)
    const early = handle("POST", PATH, validBody(), { ...ctx, now: at(TEN_MIN - 1) })
    expect(early.status).toBe(429)
    expect(early.body).toMatchObject({ retryAfterSeconds: 1 })
    expect(handle("POST", PATH, validBody(), { ...ctx, now: at(TEN_MIN) }).status).toBe(201)
  })

  it("a 429 is not counted", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    postTimes(ctx, 5)
    expect(postTimes(ctx, 3)).toEqual([429, 429, 429])
    expect(handle("POST", PATH, validBody(), { ...ctx, now: at(TEN_MIN) }).status).toBe(201)
  })

  it("another IP can still post", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    postTimes(ctx, 6)
    expect(handle("POST", PATH, validBody(), { ...ctx, ip: "10.0.0.2" }).status).toBe(201)
  })

  it("400s count, so a valid 6th gets 429", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    expect(postTimes(ctx, 5, {})).toEqual([400, 400, 400, 400, 400])
    expect(handle("POST", PATH, validBody(), ctx).status).toBe(429)
  })

  it("404 unknown district counts", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    for (let i = 0; i < 5; i++) handle("POST", "/districts/atlantis/reports", validBody(), ctx)
    expect(handle("POST", PATH, validBody(), ctx).status).toBe(429)
  })

  it("the limit is checked before the district, so an unknown district also gets 429", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    postTimes(ctx, 5)
    expect(handle("POST", "/districts/atlantis/reports", validBody(), ctx).status).toBe(429)
  })

  it("other methods at the endpoint are not counted", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    for (let i = 0; i < 6; i++) handle("GET", PATH, undefined, ctx)
    expect(postTimes(ctx, 5)).toEqual([201, 201, 201, 201, 201])
  })

  it("::ffff:10.0.0.1 and 10.0.0.1 share a bucket", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    postTimes(ctx, 5)
    expect(handle("POST", PATH, validBody(), { ...ctx, ip: "::ffff:10.0.0.1" }).status).toBe(429)
  })

  it("no ip shares one bucket and gets 429 on the 6th", () => {
    const ctx = makeCtx()
    expect(postTimes(ctx, 6)).toEqual([201, 201, 201, 201, 201, 429])
  })

  it("a different phone does not help", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    const phones = [undefined, null, "", "0000000000", "000-000-0000", "000 000 0000"]
    const statuses = phones.map((phone) => handle("POST", PATH, { ...validBody(), phone }, ctx).status)
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
  })

  it("429 has no phone and no IP", () => {
    const ctx = makeCtx({ ip: "203.0.113.7" })
    postTimes(ctx, 5)
    const json = JSON.stringify(handle("POST", PATH, { ...validBody(), phone: "0000000000" }, ctx))
    expect(json).toContain("too many reports")
    expect(json).not.toContain("0000000000")
    expect(json).not.toContain("203.0.113.7")
  })

  it("src/ never reads X-Forwarded-For", () => {
    const dir = new URL("../src/", import.meta.url)
    for (const file of readdirSync(dir)) {
      expect(readFileSync(new URL(file, dir), "utf8").toLowerCase(), file).not.toContain("x-forwarded-for")
    }
  })
})

describe("ipKey", () => {
  it.each([
    [undefined, "unknown"],
    ["", "unknown"],
    ["10.0.0.1", "10.0.0.1"],
    ["::ffff:10.0.0.1", "10.0.0.1"],
    ["::FFFF:10.0.0.1", "10.0.0.1"]
  ])("%j -> %j", (ip, key) => {
    expect(ipKey(ip)).toBe(key)
  })
})

describe("createRateLimiter", () => {
  it("uses 5 per 10 minutes for reports", () => {
    expect(REPORT_RATE_LIMIT).toEqual({ limit: 5, windowMs: TEN_MIN })
  })

  it("RPT-REQ-017 purge drops old hits and removes empty keys", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: TEN_MIN })
    limiter.hit("a", now)
    limiter.hit("b", at(1))
    expect(limiter.keyCount()).toBe(2)
    limiter.purge(at(TEN_MIN - 1))
    expect(limiter.keyCount()).toBe(2)
    limiter.purge(at(TEN_MIN))
    expect(limiter.keyCount()).toBe(1)
    limiter.purge(at(TEN_MIN + 1))
    expect(limiter.keyCount()).toBe(0)
  })
})
