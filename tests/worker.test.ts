import { describe, expect, it } from "vitest"
import worker from "../src/worker.ts"
import { NOTICE } from "../src/app.ts"
import { REPORT_NOTICE } from "../src/reports.ts"

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

const text = async (path: string) => get(path).text()

describe("web page", () => {
  it("lists the endpoints at /api", async () => {
    const res = get("/api")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { endpoints: string[] }).endpoints).toContain("/districts/chatuchak/reports")
  })

  it("serves HTML at the root with both notices", async () => {
    const res = get("/")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    const html = await res.text()
    expect(html).toContain('<html lang="th">')
    expect(html).toContain(NOTICE)
    expect(html).toContain(REPORT_NOTICE)
    expect(html).not.toMatch(/(src|href)="https?:/)
    expect(html).not.toContain("<form")
  })

  it("sets security headers", () => {
    const csp = get("/").headers.get("content-security-policy")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self'")
    for (const path of ["/", "/app.css", "/app.js"]) {
      expect(get(path).headers.get("x-content-type-options")).toBe("nosniff")
    }
  })

  it("serves the assets with the right types", () => {
    expect(get("/app.css").headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(get("/app.js").headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })

  it("never builds HTML from data in app.js", async () => {
    const js = await text("/app.js")
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
      expect(js).not.toContain(sink)
    }
    expect(js).toContain("textContent")
    expect(js).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/)
  })

  it("keeps unknown paths a 404, including object keys", () => {
    expect(get("/nope").status).toBe(404)
    expect(get("/constructor").status).toBe(404)
  })
})
