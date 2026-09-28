import { districts } from "./districts.ts"

export type Severity = 1 | 2 | 3 | 4

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: "น้ำขัง",
  2: "รถเล็กผ่านยาก",
  3: "รถเล็กผ่านไม่ได้",
  4: "อันตราย"
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
export const MERGE_WINDOW_MS = 2 * HOUR
export const EXPIRY_MS = 6 * HOUR
const MAX_SEEN_AGE_MS = 6 * HOUR
const MAX_CLOCK_SKEW_MS = 5 * MINUTE

/** Severity from water depth in whole centimetres (course-defined scale, not an official one). */
export function severityFor(depthCm: number): Severity {
  if (depthCm <= 10) return 1
  if (depthCm <= 30) return 2
  if (depthCm <= 50) return 3
  return 4
}

/** Key used to spot the same place: trimmed, inner spaces collapsed, lower case. */
export function landmarkKey(landmark: string): string {
  return landmark.trim().replace(/\s+/g, " ").toLowerCase()
}

export type ReportInput = {
  districtId: string
  landmark: string
  depthCm: number
  seenAt: Date
  phone?: string
}

export type Validation = { ok: true; input: ReportInput } | { ok: false; error: string }

/** Check an untrusted request body (RPT-REQ-003). */
export function validateReport(body: unknown, now: Date): Validation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be an object" }
  const b = body as Record<string, unknown>

  if (typeof b.districtId !== "string" || !districts.has(b.districtId)) return { ok: false, error: "unknown districtId" }

  if (typeof b.landmark !== "string") return { ok: false, error: "landmark is required" }
  const landmark = b.landmark.trim().replace(/\s+/g, " ")
  if (landmark.length < 2 || landmark.length > 100) return { ok: false, error: "landmark must be 2–100 characters" }

  if (typeof b.depthCm !== "number" || !Number.isInteger(b.depthCm) || b.depthCm < 1 || b.depthCm > 300) {
    return { ok: false, error: "depthCm must be a whole number from 1 to 300" }
  }

  const seenAt = typeof b.seenAt === "string" ? new Date(b.seenAt) : undefined
  if (!seenAt || Number.isNaN(seenAt.getTime())) return { ok: false, error: "seenAt must be an ISO date-time" }
  if (seenAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return { ok: false, error: "seenAt is in the future" }
  if (seenAt.getTime() < now.getTime() - MAX_SEEN_AGE_MS) return { ok: false, error: "seenAt is older than 6 hours" }

  if (b.phone !== undefined && (typeof b.phone !== "string" || !/^0[689]\d{8}$/.test(b.phone))) {
    return { ok: false, error: "phone must be a Thai mobile number like 0812345678" }
  }

  return {
    ok: true,
    input: { districtId: b.districtId, landmark, depthCm: b.depthCm, seenAt, ...(b.phone ? { phone: b.phone as string } : {}) }
  }
}

export type Report = {
  id: string
  districtId: string
  landmark: string
  landmarkKey: string
  depthCm: number
  severity: Severity
  seenAt: Date
  createdAt: Date
  lastConfirmedAt: Date
  confirmations: number
  phone?: string
}

function isActive(r: Report, now: Date): boolean {
  return now.getTime() - r.lastConfirmedAt.getTime() <= EXPIRY_MS
}

/** Reports kept in memory: one process only, lost on restart. */
export class ReportStore {
  private reports: Report[] = []
  private nextId = 1

  /** Add a report, or confirm an existing one for the same spot (RPT-REQ-004). */
  submit(input: ReportInput, now: Date): { report: Report; merged: boolean } {
    const key = landmarkKey(input.landmark)
    const existing = this.reports.find(
      (r) =>
        r.districtId === input.districtId &&
        r.landmarkKey === key &&
        now.getTime() - r.lastConfirmedAt.getTime() <= MERGE_WINDOW_MS
    )
    if (existing) {
      existing.depthCm = input.depthCm
      existing.severity = severityFor(input.depthCm)
      existing.seenAt = input.seenAt
      existing.lastConfirmedAt = now
      existing.confirmations += 1
      return { report: existing, merged: true }
    }

    const report: Report = {
      id: `r${this.nextId++}`,
      districtId: input.districtId,
      landmark: input.landmark,
      landmarkKey: key,
      depthCm: input.depthCm,
      severity: severityFor(input.depthCm),
      seenAt: input.seenAt,
      createdAt: now,
      lastConfirmedAt: now,
      confirmations: 1,
      ...(input.phone ? { phone: input.phone } : {})
    }
    this.reports.push(report)
    return { report, merged: false }
  }

  /** Unexpired reports for a district, most severe first, then most recently confirmed (RPT-REQ-005, 006). */
  active(districtId: string, now: Date): Report[] {
    return this.reports
      .filter((r) => r.districtId === districtId && isActive(r, now))
      .sort((a, b) => b.severity - a.severity || b.lastConfirmedAt.getTime() - a.lastConfirmedAt.getTime())
  }
}
