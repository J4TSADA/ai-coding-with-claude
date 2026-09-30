import type { Context } from "../src/app.ts"
import { createRateLimiter, REPORT_RATE_LIMIT } from "../src/rate-limit.ts"
import { createReportStore } from "../src/reports.ts"

export const now = new Date("2026-09-30T12:30:00Z")

/** Fresh store, limiter and id counter every call, so no state leaks between tests. */
export function makeCtx(overrides: Partial<Context> = {}): Context {
  let n = 0
  return {
    now,
    reports: createReportStore(),
    limiter: createRateLimiter(REPORT_RATE_LIMIT),
    newId: () => `id-${++n}`,
    ...overrides
  }
}
