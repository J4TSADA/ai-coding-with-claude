import { districts } from "./districts.ts"
import { RateLimiter } from "./rate-limit.ts"
import { ReportStore, SEVERITY_LABELS, validateReport, type Report } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = { now: Date; ip?: string }

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"
export const REPORT_NOTICE = "รายงานจากผู้ใช้ ไม่ใช่ประกาศเตือนภัยทางการ ตรวจสอบกับประกาศของกรุงเทพมหานครก่อนตัดสินใจ"

/** Build a request handler. Kept free of node:http so it is easy to test. */
export function createApp(store = new ReportStore(), limiter = new RateLimiter()) {
  return function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
    if (method === "GET" && path === "/districts") {
      return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
    }

    const reportsMatch = path.match(/^\/districts\/([a-z-]+)\/reports$/)
    if (method === "GET" && reportsMatch) {
      const district = districts.get(reportsMatch[1] ?? "")
      if (!district) return { status: 404, body: { error: "unknown district" } }
      return { status: 200, body: { notice: REPORT_NOTICE, district, reports: store.active(district.id, ctx.now).map(publicReport) } }
    }

    const districtMatch = path.match(/^\/districts\/([a-z-]+)$/)
    if (method === "GET" && districtMatch) {
      const district = districts.get(districtMatch[1] ?? "")
      if (!district) return { status: 404, body: { error: "unknown district" } }
      const stations = stationsIn(district.id).map((s) => {
        const latest = latestReading(s, ctx.now)
        return {
          id: s.id,
          nameTh: s.nameTh,
          latest: latest ? { at: toBangkokIso(latest.at), levelCm: latest.levelCm } : null
        }
      })
      return { status: 200, body: { notice: NOTICE, district, stations } }
    }

    if (method === "POST" && path === "/reports") {
      if (!limiter.allow(ctx.ip ?? "unknown", ctx.now)) return { status: 429, body: { error: "too many reports, try again later" } }
      const v = validateReport(body, ctx.now)
      if (!v.ok) return { status: 400, body: { error: v.error } }
      const { report, merged } = store.submit(v.input, ctx.now)
      console.log("report", report.id, merged ? "confirmed" : "new", report.districtId)
      return { status: merged ? 200 : 201, body: { notice: REPORT_NOTICE, merged, report: publicReport(report) } }
    }

    return { status: 404, body: { error: "not found" } }
  }
}

export const handle = createApp()

/** What the public may see. Never includes the reporter's phone. */
function publicReport(r: Report) {
  return {
    id: r.id,
    districtId: r.districtId,
    landmark: r.landmark,
    depthCm: r.depthCm,
    severity: r.severity,
    severityLabel: SEVERITY_LABELS[r.severity],
    seenAt: toBangkokIso(r.seenAt),
    lastConfirmedAt: toBangkokIso(r.lastConfirmedAt),
    confirmations: r.confirmations
  }
}
