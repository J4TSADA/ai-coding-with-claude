/** Allows at most `limit` events per key in a sliding time window. In memory: one process only. */
export class RateLimiter {
  private events = new Map<string, number[]>()

  constructor(
    private readonly limit = 5,
    private readonly windowMs = 10 * 60 * 1000
  ) {}

  /** Records the event and returns true, or returns false if the key is over its limit. */
  allow(key: string, now: Date): boolean {
    const since = now.getTime() - this.windowMs
    const recent = (this.events.get(key) ?? []).filter((t) => t > since)
    if (recent.length >= this.limit) {
      this.events.set(key, recent)
      return false
    }
    this.events.set(key, [...recent, now.getTime()])
    return true
  }
}
