import { describe, expect, it } from "vitest"
import worker from "../src/worker.ts"
import { NOTICE } from "../src/app.ts"
import { REPORT_NOTICE } from "../src/reports.ts"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { districts } from "../src/districts.ts"

const get = (path: string, method = "GET") => worker.fetch(new Request(`https://demo.example${path}`, { method }))

describe("live demo worker", () => {
  it("serves seeded reports for a district, most severe first, without phone numbers", async () => {
    const res = get("/districts/chatuchak/reports")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { reports: { landmark: string; confirmations: number; severity: number }[] }
    expect(body.reports.map((r) => r.landmark)).toEqual(["หน้าตลาดนัดจตุจักร ประตู 1", "ห้าแยกลาดพร้าว"])
    expect(body.reports[0]?.confirmations).toBe(2)
    expect(JSON.stringify(body)).not.toContain("phone")
  })

  it("refuses writes", () => {
    expect(get("/reports", "POST").status).toBe(405)
  })

  it("keeps the app's 404 for unknown districts", () => {
    expect(get("/districts/atlantis/reports").status).toBe(404)
  })
})

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const textOf = (path: string) => file(path).toString("utf8")

/** Outside URLs the page may mention because it never loads them. */
const NOT_LOADED = new Set(["http://www.w3.org/2000/svg", "https://openstreetmap.org/copyright", "https://protomaps.com"])

type Logic = {
  bySeverity: (a: unknown, b: unknown) => number
  countBySeverity: (reports: unknown[], filter: string) => Record<string, number>
}
const logic = (): Logic => {
  const window: { NAMTUAM_LOGIC?: Logic } = {}
  runInNewContext(textOf("public/logic.js"), { window })
  return window.NAMTUAM_LOGIC as Logic
}
const report = (id: string, level: string, seenAt: string, districtId = "chatuchak") => ({ id, districtId, seenAt, severity: { level } })

describe("map page", () => {
  it("is served from public/ by Workers Static Assets", () => {
    expect(textOf("wrangler.jsonc")).toMatch(/"assets":\s*\{\s*"directory":\s*"\.\/public"/)
    const html = textOf("public/index.html")
    expect(html).toContain('<html lang="th">')
    expect(html).toContain('id="map"')
  })

  it("shows both notices without JavaScript", () => {
    const html = textOf("public/index.html")
    expect(html).toContain(NOTICE)
    expect(html).toContain(REPORT_NOTICE)
  })

  it("lists the endpoints at /api", async () => {
    const res = get("/api")
    expect(res.status).toBe(200)
    const { endpoints } = (await res.json()) as { endpoints: string[] }
    expect(endpoints).toContain("/api/centres")
    expect(endpoints).toContain("/districts/chatuchak/reports")
  })

  it("gives a centre inside Bangkok for every district", async () => {
    const res = get("/api/centres")
    expect(res.status).toBe(200)
    const { notice, centres } = (await res.json()) as { notice: string; centres: Record<string, [number, number]> }
    expect(notice).toBe(NOTICE)
    expect(Object.keys(centres).sort()).toEqual([...districts.keys()].sort())
    for (const [lon, lat] of Object.values(centres)) {
      expect(lon).toBeGreaterThanOrEqual(100.3)
      expect(lon).toBeLessThanOrEqual(100.95)
      expect(lat).toBeGreaterThanOrEqual(13.5)
      expect(lat).toBeLessThanOrEqual(14.05)
    }
  })

  it("loads nothing from another site", () => {
    for (const path of ["public/index.html", "public/app.js", "public/logic.js", "public/app.css"]) {
      const urls = textOf(path).match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []
      expect(urls.filter((url) => !NOT_LOADED.has(url)), path).toEqual([])
    }
  })

  it("ships vendored map files that match SHA256SUMS", () => {
    const lines = textOf("public/vendor/SHA256SUMS").trim().split("\n")
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const [hash, path] = line.trim().split(/\s+/)
      expect(createHash("sha256").update(file(`public/vendor/${path}`)).digest("hex"), path).toBe(hash)
    }
  })

  it("sets security headers for every path", () => {
    const headers = textOf("public/_headers")
    expect(headers).toMatch(/^\/\*$/m)
    expect(headers).toContain("X-Content-Type-Options: nosniff")
    for (const rule of ["script-src 'self'", "connect-src 'self'", "form-action 'none'", "frame-ancestors 'none'"]) {
      expect(headers).toContain(rule)
    }
  })

  it("never builds HTML from data and only reads", () => {
    for (const path of ["public/app.js", "public/logic.js"]) {
      const js = textOf(path)
      for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "setHTML"]) {
        expect(js, `${path} ${sink}`).not.toContain(sink)
      }
      expect(js).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/)
    }
    expect(textOf("public/app.js")).toContain("textContent")
    expect(textOf("public/index.html")).not.toContain("<form")
  })

  it("sorts reports deepest first, then newest, then id", () => {
    const L = logic()
    const list = [
      report("b", "wet", "2026-09-30T19:00:00+07:00"),
      report("c", "dangerous", "2026-09-30T18:00:00+07:00"),
      report("a", "dangerous", "2026-09-30T18:00:00+07:00"),
      report("d", "dangerous", "2026-09-30T19:00:00+07:00")
    ].sort(L.bySeverity)
    expect(list.map((r) => r.id)).toEqual(["d", "a", "c", "b"])
  })

  it("counts reports per severity for the chosen district", () => {
    const L = logic()
    const list = [report("a", "wet", "x"), report("b", "dangerous", "x"), report("c", "dangerous", "x", "lat-phrao")]
    expect({ ...L.countBySeverity(list, "all") }).toEqual({ wet: 1, "hard-for-small-cars": 0, "unsafe-for-small-cars": 0, dangerous: 2 })
    expect(L.countBySeverity(list, "chatuchak").dangerous).toBe(1)
  })

  it("keeps unknown paths a 404 and writes a 405", () => {
    expect(get("/nope").status).toBe(404)
    expect(get("/constructor").status).toBe(404)
    expect(get("/api/centres", "POST").status).toBe(405)
  })
})
