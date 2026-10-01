import { districts } from "./districts.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"
import { createRateLimiter, ipKey, type RateLimiter, REPORT_RATE_LIMIT } from "./rate-limit.ts"
import { createReportStore, REPORT_NOTICE, type ReportStore, validateReport } from "./reports.ts"

export type Response = { status: number; body: unknown; log?: string }

export type Context = {
  now: Date
  ip?: string // from socket only
  reports?: ReportStore // default: module-level store (server uses this)
  limiter?: RateLimiter // default: module-level limiter
  newId?: () => string // default: crypto.randomUUID
}

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

/** Used when ctx has no store (the server). Tests must pass their own via makeCtx(). */
const defaultReports = createReportStore()
const defaultLimiter = createRateLimiter(REPORT_RATE_LIMIT)

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
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
    const reports = (ctx.reports ?? defaultReports).listByDistrict(district.id, ctx.now)
    return { status: 200, body: { notice: NOTICE, district, stations, reportNotice: REPORT_NOTICE, reports } }
  }

  const reportMatch = path.match(/^\/districts\/([a-z-]+)\/reports$/)
  if (method === "POST" && reportMatch) {
    // Rate limit before anything else, so every POST here counts (RPT-REQ-014).
    const limit = (ctx.limiter ?? defaultLimiter).hit(ipKey(ctx.ip), ctx.now)
    if (!limit.allowed) {
      return {
        status: 429,
        body: { error: "too many reports", retryAfterSeconds: limit.retryAfterSeconds, notice: NOTICE, reportNotice: REPORT_NOTICE }
      }
    }
    const districtId = reportMatch[1] ?? ""
    if (!districts.has(districtId)) {
      return { status: 404, body: { error: "unknown district", notice: NOTICE, reportNotice: REPORT_NOTICE } }
    }
    const checked = validateReport(body, ctx.now)
    if (!checked.ok) {
      return {
        status: 400,
        body: { error: "invalid report", fields: checked.fields, notice: NOTICE, reportNotice: REPORT_NOTICE }
      }
    }
    const store = ctx.reports ?? defaultReports
    const newId = ctx.newId ?? (() => crypto.randomUUID())
    const { report, merged } = store.submit(districtId, checked.value, ctx.now, newId)
    return { status: 201, body: { notice: NOTICE, reportNotice: REPORT_NOTICE, merged, report } }
  }

  return { status: 404, body: { error: "not found" } }
}
