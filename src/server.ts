import { createServer, type Server } from "node:http"
import { pathToFileURL } from "node:url"
import { BODY_TOO_LARGE, type Context, handle, INVALID_JSON, purgeDefaults, type Response } from "./app.ts"

export const MAX_BODY_BYTES = 10_240
const PURGE_EVERY_MS = 60 * 1000

/** HTTP wrapper around handle(). Tests may pass their own store and limiter. */
export function createAppServer(deps: Pick<Context, "reports" | "limiter"> = {}): Server {
  return createServer((req, res) => {
    let path = "/" // a URL that does not parse falls through to 404 instead of crashing the process
    try {
      path = new URL(req.url ?? "/", "http://x").pathname
    } catch {}

    const reply = (body: unknown, headers: Record<string, string> = {}) => {
      let out: Response
      try {
        out = handle(req.method ?? "GET", path, body, { now: new Date(), ip: req.socket.remoteAddress, ...deps })
      } catch {
        // Path only: never the body, which may hold a phone (RPT-REQ-019).
        console.error("internal error", path)
        out = { status: 500, body: { error: "internal error" } }
      }
      if (out.log) console.log(out.log)
      res.writeHead(out.status, { "content-type": "application/json; charset=utf-8", ...headers }).end(JSON.stringify(out.body))
    }

    // Count bytes, and decode once after joining, so a Thai character split across chunks survives (RPT-REQ-018).
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return
      size += chunk.length
      if (size <= MAX_BODY_BYTES) return void chunks.push(chunk)
      // Stop keeping bytes. The rest is read and thrown away, then the connection closes.
      // Not req.destroy(): resetting while the client still sends can lose the 413 before the client reads it.
      tooLarge = true
      chunks.length = 0
      reply(BODY_TOO_LARGE, { connection: "close" })
    })
    req.on("end", () => {
      if (tooLarge) return
      const raw = Buffer.concat(chunks).toString("utf8")
      let body: unknown = undefined
      if (raw) {
        try {
          body = JSON.parse(raw)
        } catch {
          body = INVALID_JSON
        }
      }
      reply(body)
    })
  })
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const port = Number(process.env.PORT ?? 3000)
  setInterval(() => purgeDefaults(new Date()), PURGE_EVERY_MS).unref()
  createAppServer().listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
}
