import { handle, NOTICE } from "./app.ts"
import { districts } from "./districts.ts"
import { createReportStore, REPORT_NOTICE, type ReportStore, validateReport } from "./reports.ts"

const MINUTE = 60 * 1000

/** Made-up reports, all seen within the last hour, so the demo always has something to show. No phones. */
function seededStore(now: Date): ReportStore {
  const store = createReportStore()
  let n = 0
  const newId = () => `demo-${++n}`
  const seed = (districtId: string, landmark: string, depthCm: number, minutes: number) => {
    const at = new Date(now.getTime() - minutes * MINUTE)
    const checked = validateReport({ landmark, depthCm, seenAt: at.toISOString() }, at)
    if (!checked.ok) throw new Error(`bad demo seed: ${landmark}`)
    store.submit(districtId, checked.value, at, newId)
  }

  seed("chatuchak", "หน้าตลาดนัดจตุจักร ประตู 1", 40, 50)
  seed("chatuchak", "หน้าตลาดนัดจตุจักร ประตู 1", 45, 20) // a second person confirms it
  seed("chatuchak", "ห้าแยกลาดพร้าว", 20, 35)
  seed("lat-phrao", "หน้าปากซอยลาดพร้าว 71", 35, 15)
  seed("din-daeng", "ใต้ทางด่วนดินแดง", 8, 40)
  return store
}

const ENDPOINTS = ["/districts", "/districts/chatuchak", "/districts/chatuchak/reports", "/districts/lat-phrao/reports"]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })

/** Read-only demo on Cloudflare Workers. Each request gets a fresh store, so nothing is ever kept. */
export default {
  fetch(request: Request): Response {
    if (request.method !== "GET") return json(405, { error: "read-only demo: only GET is allowed" })

    const path = new URL(request.url).pathname
    if (path === "/") return json(200, { notice: NOTICE, endpoints: ENDPOINTS })

    const now = new Date()
    const reports = seededStore(now)

    // The app has no GET for this path (reports come with GET /districts/:id), so the demo lists them itself.
    const reportsMatch = path.match(/^\/districts\/([a-z-]+)\/reports$/)
    if (reportsMatch) {
      const districtId = reportsMatch[1] ?? ""
      if (!districts.has(districtId)) return json(404, { error: "unknown district" })
      return json(200, { notice: NOTICE, reportNotice: REPORT_NOTICE, reports: reports.listByDistrict(districtId, now) })
    }

    const { status, body } = handle("GET", path, undefined, { now, reports })
    return json(status, body)
  }
}
