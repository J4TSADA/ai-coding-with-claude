import { isIPv4, isIPv6 } from "node:net"

export type RateLimiter = {
  /** Records the attempt if allowed. A refused attempt is not recorded. */
  hit(key: string, now: Date): { allowed: true } | { allowed: false; retryAfterSeconds: number }
  /** Drops hits outside the window and removes keys left empty. */
  purge(now: Date): void
  /** For tests only. */
  keyCount(): number
}

export const REPORT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 }

/** Sliding window, in memory only. A hit at t still counts while now - t < windowMs. */
export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, Date[]>()
  const live = (list: Date[], now: Date) => list.filter((t) => now.getTime() - t.getTime() < opts.windowMs)

  return {
    hit(key, now) {
      const list = live(hits.get(key) ?? [], now)
      if (list.length > 0 && list.length >= opts.limit) {
        hits.set(key, list)
        // Not list[0]: if the clock steps back, hits are no longer in time order.
        const oldest = Math.min(...list.map((t) => t.getTime()))
        const waitMs = oldest + opts.windowMs - now.getTime()
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) }
      }
      list.push(now)
      hits.set(key, list)
      return { allowed: true }
    },

    purge(now) {
      for (const [key, list] of hits) {
        const kept = live(list, now)
        if (kept.length === 0) hits.delete(key)
        else hits.set(key, kept)
      }
    },

    keyCount() {
      return hits.size
    }
  }
}

/**
 * Limiter key for an IP from the socket. Never from a proxy/forwarding header or any other header.
 * Missing IP shares one "unknown" bucket so it cannot skip the limit.
 * IPv6 is grouped by /64, so hopping addresses inside one prefix does not help (RPT-REQ-014, EC-20).
 */
export function ipKey(ip: string | undefined): string {
  if (!ip) return "unknown"
  const mapped = /^::ffff:(.+)$/i.exec(ip)?.[1]
  if (mapped && isIPv4(mapped)) return mapped
  if (isIPv6(ip)) return `${expandIPv6(ip).slice(0, 4).join(":")}::/64`
  return ip
}

/** Eight 4-digit lower-case groups, e.g. "2001:db8::1" -> ["2001", "0db8", "0000", …, "0001"]. */
function expandIPv6(ip: string): string[] {
  let addr = ip.split("%")[0] ?? "" // drop a zone id such as %eth0
  // An embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) is the last two groups.
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(addr)
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number]
    addr = addr.slice(0, v4.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16)
  }
  const [head = "", tail] = addr.split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const zeros = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill("0")
  return [...left, ...zeros, ...right].map((g) => g.toLowerCase().padStart(4, "0"))
}
