import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BODY_TOO_LARGE, handle, INVALID_JSON, NOTICE } from "../src/app.ts"
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
// Counts submissions, not groups: identical bodies merge into one report (RPT-REQ-012).
const stored = (ctx: Ctx) =>
  ctx.reports!.listByDistrict("lat-phrao", ctx.now).reduce((n, r) => n + r.confirmations, 0)

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

  it.each([
    ["INVALID_JSON", INVALID_JSON],
    ["BODY_TOO_LARGE", BODY_TOO_LARGE]
  ])("5 × %s count, so a valid 6th gets 429", (_name, sentinel) => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    expect(postTimes(ctx, 5, sentinel)).toEqual(Array(5).fill(sentinel === INVALID_JSON ? 400 : 413))
    expect(handle("POST", PATH, validBody(), ctx).status).toBe(429)
  })

  it("IPv6 in one /64 shares a bucket, another /64 does not (EC-20)", () => {
    const ctx = makeCtx({ ip: "2001:db8:1:2:aaaa::1" })
    postTimes(ctx, 5)
    expect(handle("POST", PATH, validBody(), { ...ctx, ip: "2001:db8:1:2:bbbb::2" }).status).toBe(429)
    expect(handle("POST", PATH, validBody(), { ...ctx, ip: "2001:db8:1:3::1" }).status).toBe(201)
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
    ["::FFFF:10.0.0.1", "10.0.0.1"],
    ["2001:db8:1:2:aaaa::1", "2001:0db8:0001:0002::/64"],
    ["2001:DB8:1:2::", "2001:0db8:0001:0002::/64"],
    ["::1", "0000:0000:0000:0000::/64"],
    ["fe80::1%eth0", "fe80:0000:0000:0000::/64"],
    ["64:ff9b::192.0.2.1", "0064:ff9b:0000:0000::/64"],
    ["2001:db8:1:2:3:4:5:6", "2001:0db8:0001:0002::/64"],
    ["::ffff:2001:db8::1", "::ffff:2001:db8::1"]
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

  it("purge keeps the live hits of a key that also has old ones", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: TEN_MIN })
    limiter.hit("a", now)
    limiter.hit("a", at(5 * 60 * 1000))
    limiter.purge(at(TEN_MIN))
    expect(limiter.keyCount()).toBe(1)
    expect(limiter.hit("a", at(TEN_MIN)).allowed).toBe(true)
    expect(limiter.hit("a", at(TEN_MIN))).toEqual({ allowed: false, retryAfterSeconds: 300 })
  })

  it("retryAfterSeconds uses the oldest hit even if the clock stepped back", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: TEN_MIN })
    limiter.hit("a", at(5 * 60 * 1000))
    limiter.hit("a", now)
    expect(limiter.hit("a", at(6 * 60 * 1000))).toEqual({ allowed: false, retryAfterSeconds: 240 })
  })

  it("a GET or POST purges the limiter (RPT-REQ-017, 021)", () => {
    const ctx = makeCtx({ ip: "203.0.113.7" })
    handle("POST", PATH, validBody(), ctx)
    expect(ctx.limiter!.keyCount()).toBe(1)
    handle("GET", "/districts/lat-phrao", undefined, { ...ctx, now: at(TEN_MIN) })
    expect(ctx.limiter!.keyCount()).toBe(0)
  })
})
