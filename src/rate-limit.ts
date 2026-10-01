import { isIPv4 } from "node:net"

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
      const oldest = list[0]
      if (oldest && list.length >= opts.limit) {
        hits.set(key, list)
        const waitMs = oldest.getTime() + opts.windowMs - now.getTime()
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
 * TODO (Later, RPT-REQ-014): group IPv6 by /64. For now an IPv6 address is its own key.
 */
export function ipKey(ip: string | undefined): string {
  if (!ip) return "unknown"
  const mapped = /^::ffff:(.+)$/i.exec(ip)?.[1]
  if (mapped && isIPv4(mapped)) return mapped
  return ip
}
