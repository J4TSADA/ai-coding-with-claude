import { handle, NOTICE } from "./app.ts"
import { districts } from "./districts.ts"
import { districtCentres } from "./district-centres.ts"
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

const ENDPOINTS = ["/api/centres", "/districts", "/districts/chatuchak", "/districts/chatuchak/reports", "/districts/lat-phrao/reports"]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })

/** The Workers Static Assets binding (wrangler.jsonc `assets.binding`). */
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } }

type ByteRange = { start: number; end: number } // inclusive

/** One `bytes=` range (`a-b`, `a-`, `-n`) against `size` bytes; undefined when unusable. */
export function parseRange(header: string, size: number): ByteRange | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === "" && m[2] === "")) return undefined
  const [first, last] = [m[1] ?? "", m[2] ?? ""]
  const range =
    first === ""
      ? { start: Math.max(0, size - Number(last)), end: size - 1 }
      : { start: Number(first), end: last === "" ? size - 1 : Math.min(Number(last), size - 1) }
  return range.start <= range.end && range.start < size ? range : undefined
}

/** Pass on bytes start..end (inclusive) of a stream, then stop reading. */
function sliceStream(body: ReadableStream<Uint8Array>, { start, end }: ByteRange): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let offset = 0
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || offset > end) {
          controller.close()
          await reader.cancel()
          return
        }
        const from = Math.max(start - offset, 0)
        const to = Math.min(end - offset + 1, value.length)
        offset += value.length
        if (from < to) {
          controller.enqueue(value.subarray(from, to))
          return
        }
      }
    },
    cancel: () => reader.cancel()
  })
}

/**
 * The tiles file read once per isolate, by URL. A static file, not app state: reading all 22 MB for
 * every tile made each request take ~20 s. Concurrent requests share one read; a failed read is retried.
 */
const tileCache = new Map<string, Promise<Uint8Array<ArrayBuffer>>>()

function tileBytes(url: string, asset: Response): Promise<Uint8Array<ArrayBuffer>> {
  const cached = tileCache.get(url)
  if (cached) {
    void asset.body?.cancel()
    return cached
  }
  const read = asset.arrayBuffer().then((buf) => new Uint8Array(buf))
  tileCache.set(url, read)
  read.catch(() => tileCache.delete(url))
  return read
}

/**
 * The map tiles file (ADR 0001) needs HTTP Range requests, which Workers Static Assets answers with
 * the whole file, so this worker cuts the range itself (wrangler.jsonc `run_worker_first`).
 */
async function serveTiles(request: Request, env: Env): Promise<Response> {
  const rangeHeader = request.headers.get("range")
  const cached = rangeHeader === null ? undefined : tileCache.get(request.url)
  const asset = cached ? new Response(await cached) : await env.ASSETS.fetch(new Request(request.url))
  if (asset.status !== 200 || !asset.body || rangeHeader === null) return asset
  const headers = { "content-type": "application/octet-stream", "accept-ranges": "bytes", "x-content-type-options": "nosniff" }
  const partial = (body: BodyInit, range: ByteRange, size: number) =>
    new Response(body, {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": String(range.end - range.start + 1) }
    })
  const notSatisfiable = (size: number) => new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } })

  // With a known length, stream only up to the range. Without one (chunked), read the file to learn its size.
  const length = Number(asset.headers.get("content-length") ?? NaN)
  if (Number.isInteger(length) && length > 0) {
    const range = parseRange(rangeHeader, length)
    if (!range) {
      await asset.body.cancel()
      return notSatisfiable(length)
    }
    return partial(sliceStream(asset.body, range), range, length)
  }
  const bytes = await tileBytes(request.url, asset)
  const range = parseRange(rangeHeader, bytes.length)
  return range ? partial(bytes.slice(range.start, range.end + 1), range, bytes.length) : notSatisfiable(bytes.length)
}

/** The demo's API. GET only. Each request gets a fresh store, so nothing is ever kept. */
function route(request: Request): Response {
  if (request.method !== "GET") return json(405, { error: "read-only demo: only GET is allowed" })

  const path = new URL(request.url).pathname
  if (path === "/api") return json(200, { notice: NOTICE, endpoints: ENDPOINTS })
  if (path === "/api/centres") return json(200, { notice: NOTICE, centres: districtCentres })

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

/**
 * Read-only demo on Cloudflare Workers. The map page (public/) is served by Workers Static Assets
 * before this runs; see wrangler.jsonc and public/_headers. Only paths with no file reach here,
 * plus /tiles/* (serveTiles). Without `env` (tests), every path goes to route() and stays synchronous.
 */
function fetch(request: Request): Response
function fetch(request: Request, env: Env): Response | Promise<Response>
function fetch(request: Request, env?: Env): Response | Promise<Response> {
  if (env && request.method === "GET" && new URL(request.url).pathname.startsWith("/tiles/")) return serveTiles(request, env)
  return route(request)
}

export default { fetch }
