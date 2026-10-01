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

/** The server passes these instead of a body, so the limit and notices stay in handle() (RPT-REQ-018). */
export const INVALID_JSON: unique symbol = Symbol("INVALID_JSON")
export const BODY_TOO_LARGE: unique symbol = Symbol("BODY_TOO_LARGE")

/** Used when ctx has no store (the server). Tests must pass their own via makeCtx(). */
const defaultReports = createReportStore()
const defaultLimiter = createRateLimiter(REPORT_RATE_LIMIT)

/** Drop expired submissions (and phones) and old limiter keys (RPT-REQ-017). */
function purge(ctx: Context): void {
  ;(ctx.reports ?? defaultReports).purgeExpired(ctx.now)
  ;(ctx.limiter ?? defaultLimiter).purge(ctx.now)
}

/** For the server's timer, so data is purged even with no requests (RPT-REQ-017, EC-22). */
export function purgeDefaults(now: Date): void {
  purge({ now })
}

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  const reportMatch = path.match(/^\/districts\/([a-z-]+)\/reports$/)
  if (method === "POST" && reportMatch) return postReport(reportMatch[1] ?? "", body, ctx)

  if (body === INVALID_JSON) return { status: 400, body: { error: "invalid JSON" } }
  if (body === BODY_TOO_LARGE) return { status: 413, body: { error: "body too large" } }

  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
  }

  const districtMatch = path.match(/^\/districts\/([a-z-]+)$/)
  if (method === "GET" && districtMatch) {
    const district = districts.get(districtMatch[1] ?? "")
    if (!district) return { status: 404, body: { error: "unknown district" } }
    purge(ctx)
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

  return { status: 404, body: { error: "not found" } }
}

/** POST /districts/:id/reports, in the order the spec gives. */
function postReport(districtId: string, body: unknown, ctx: Context): Response {
  const notices = { notice: NOTICE, reportNotice: REPORT_NOTICE }
  purge(ctx)
  // Rate limit before anything else, so every POST here counts (RPT-REQ-014).
  const limit = (ctx.limiter ?? defaultLimiter).hit(ipKey(ctx.ip), ctx.now)
  if (!limit.allowed) {
    return { status: 429, body: { error: "too many reports", retryAfterSeconds: limit.retryAfterSeconds, ...notices } }
  }
  if (body === BODY_TOO_LARGE) return { status: 413, body: { error: "body too large", ...notices } }
  if (body === INVALID_JSON) return { status: 400, body: { error: "invalid JSON", ...notices } }
  if (!districts.has(districtId)) {
    return { status: 404, body: { error: "unknown district", ...notices } }
  }
  const checked = validateReport(body, ctx.now)
  if (!checked.ok) {
    return { status: 400, body: { error: "invalid report", fields: checked.fields, ...notices } }
  }
  const store = ctx.reports ?? defaultReports
  const newId = ctx.newId ?? (() => crypto.randomUUID())
  const { report, merged, submissionId } = store.submit(districtId, checked.value, ctx.now, newId)
  return {
    status: 201,
    body: { ...notices, merged, report },
    // IDs only: no landmark, IP or phone (RPT-REQ-016, 021).
    log: `report accepted submission=${submissionId} report=${report.id} district=${districtId} merged=${merged}`
  }
}
