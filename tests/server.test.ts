import { request } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRateLimiter } from "../src/rate-limit.ts"
import { createReportStore, type ReportStore } from "../src/reports.ts"
import { createAppServer, MAX_BODY_BYTES } from "../src/server.ts"

// Real HTTP, but only ever on 127.0.0.1 and a port the OS picks.
type Reply = { status: number; body: Record<string, unknown> }

let server: ReturnType<typeof createAppServer>
let base: string
let reports: ReportStore

beforeEach(async () => {
  reports = createReportStore()
  // A high limit, so the tests here are not about the rate limit.
  server = createAppServer({ reports, limiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }) })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise((resolve) => server.close(resolve))
})

const PATH = "/districts/lat-phrao/reports"
const seenAt = () => new Date(Date.now() - 60_000).toISOString()

async function send(path: string, body: string, method = "POST"): Promise<Reply> {
  const res = await fetch(base + path, { method, body, headers: { "content-type": "application/json" } })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Writes the body one byte at a time, so multi-byte characters are split across chunks. */
function sendByteByByte(path: string, bytes: Buffer): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (c: string) => (raw += c))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }))
    })
    req.on("error", reject)
    req.setNoDelay(true)
    const writeNext = (i: number) => {
      if (i === bytes.length) return void req.end()
      req.write(bytes.subarray(i, i + 1), () => setImmediate(() => writeNext(i + 1)))
    }
    writeNext(0)
  })
}

/** JSON of exactly `bytes` bytes. */
const bodyOfSize = (bytes: number, filler = "a") => {
  const shell = JSON.stringify({ pad: "" })
  return JSON.stringify({ pad: filler.repeat(bytes - Buffer.byteLength(shell)) })
}

describe("RPT-REQ-018 body size and UTF-8", () => {
  it(`${MAX_BODY_BYTES} bytes is read, ${MAX_BODY_BYTES + 1} bytes is 413`, async () => {
    const atLimit = bodyOfSize(MAX_BODY_BYTES)
    expect(Buffer.byteLength(atLimit)).toBe(MAX_BODY_BYTES)
    expect((await send(PATH, atLimit)).status).toBe(400) // read and validated: pad is an unknown field

    const over = await send(PATH, bodyOfSize(MAX_BODY_BYTES + 1))
    expect(over.status).toBe(413)
    expect(over.body).toMatchObject({ error: "body too large" })
  })

  it("a Thai landmark sent one byte per chunk is stored exactly", async () => {
    const landmark = "หน้าปากซอยลาดพร้าว ๗๑"
    const res = await sendByteByByte(PATH, Buffer.from(JSON.stringify({ landmark, depthCm: 30, seenAt: seenAt() })))
    expect(res.status).toBe(201)
    expect((res.body.report as { landmark: string }).landmark).toBe(landmark)
  })

  it("invalid JSON at the report endpoint is 400 with notices", async () => {
    const res = await send(PATH, "{not json")
    expect(res.status).toBe(400)
    expect(Object.keys(res.body).sort()).toEqual(["error", "notice", "reportNotice"])
  })

  it("invalid JSON elsewhere keeps the old shape", async () => {
    expect(await send("/districts", "{not json")).toEqual({ status: 400, body: { error: "invalid JSON" } })
  })
})

describe("RPT-REQ-016 nothing personal reaches the log", () => {
  it("success, 400, 413 and invalid JSON log no phone", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const phone = "0000000000"
    const ok = await send(PATH, JSON.stringify({ landmark: "หน้าตลาดนัด", depthCm: 30, seenAt: seenAt(), phone }))
    expect(ok.status).toBe(201)
    expect((await send(PATH, JSON.stringify({ landmark: "หน้าตลาดนัด", depthCm: 30, seenAt: seenAt(), phone: phone + "0" }))).status).toBe(400)
    expect((await send(PATH, bodyOfSize(MAX_BODY_BYTES + 1, phone))).status).toBe(413)
    expect((await send(PATH, `{"phone":"${phone}",`)).status).toBe(400)

    const logged = spies.flatMap((s) => s.mock.calls.map((args) => args.map(String).join(" ")))
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/^report accepted submission=\S+ report=\S+ district=lat-phrao merged=false$/)
    for (const line of logged) expect(line).not.toContain(phone)
  })
})

describe("RPT-REQ-019 a thrown error is a plain 500", () => {
  it("answers 500 internal error and logs only the path", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(reports, "purgeExpired").mockImplementation(() => {
      throw new Error("boom 0000000000")
    })
    const res = await send(PATH, JSON.stringify({ landmark: "หน้าตลาดนัด", depthCm: 30, seenAt: seenAt(), phone: "0000000000" }))
    expect(res).toEqual({ status: 500, body: { error: "internal error" } })
    expect(errors.mock.calls).toEqual([["internal error", PATH]])
  })
})
