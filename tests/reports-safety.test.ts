import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app.ts"

const at = (minute: number) => ({ now: new Date(Date.UTC(2026, 8, 30, 12, minute)), ip: "9.9.9.9" })
const body = (landmark: string) => ({ districtId: "din-daeng", landmark, depthCm: 35, seenAt: "2026-09-30T11:55:00Z" })

afterEach(() => vi.restoreAllMocks())

describe("rate limit (RPT-REQ-007)", () => {
  it("rejects the 6th report from one IP within 10 minutes", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) expect(app("POST", "/reports", body(`จุดที่ ${i}`), at(i)).status).toBe(201)
    expect(app("POST", "/reports", body("จุดที่ 6"), at(5)).status).toBe(429)
  })

  it("allows reports again after the window", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) app("POST", "/reports", body(`จุดที่ ${i}`), at(0))
    expect(app("POST", "/reports", body("จุดใหม่"), at(11)).status).toBe(201)
  })

  it("counts each IP separately", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) app("POST", "/reports", body(`จุดที่ ${i}`), at(0))
    expect(app("POST", "/reports", body("อีกคน"), { ...at(1), ip: "8.8.8.8" }).status).toBe(201)
  })
})

describe("phone never leaks (RPT-REQ-008)", () => {
  it("is not in the response or the logs", () => {
    const logged: unknown[][] = []
    vi.spyOn(console, "log").mockImplementation((...args) => void logged.push(args))
    vi.spyOn(console, "error").mockImplementation((...args) => void logged.push(args))

    const app = createApp()
    const post = app("POST", "/reports", { ...body("แยกดินแดง"), phone: "0812345678" }, at(0))
    const list = app("GET", "/districts/din-daeng/reports", undefined, at(1))

    expect(JSON.stringify(post.body)).not.toContain("0812345678")
    expect(JSON.stringify(list.body)).not.toContain("0812345678")
    expect(JSON.stringify(logged)).not.toContain("0812345678")
  })
})
