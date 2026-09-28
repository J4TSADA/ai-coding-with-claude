export type Severity = 1 | 2 | 3 | 4

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: "น้ำขัง",
  2: "รถเล็กผ่านยาก",
  3: "รถเล็กผ่านไม่ได้",
  4: "อันตราย"
}

/** Severity from water depth in whole centimetres (course-defined scale, not an official one). */
export function severityFor(depthCm: number): Severity {
  if (depthCm <= 10) return 1
  if (depthCm <= 30) return 2
  if (depthCm <= 50) return 3
  return 4
}

export type ReportInput = {
  districtId: string
  landmark: string
  depthCm: number
  seenAt: Date
  phone?: string
}

export type Report = {
  id: string
  districtId: string
  landmark: string
  depthCm: number
  severity: Severity
  seenAt: Date
  createdAt: Date
  lastConfirmedAt: Date
  confirmations: number
  phone?: string
}

/** Reports kept in memory: one process only, lost on restart. */
export class ReportStore {
  private reports: Report[] = []
  private nextId = 1

  submit(input: ReportInput, now: Date): { report: Report; merged: boolean } {
    console.log("new report", input)
    const report: Report = {
      id: `r${this.nextId++}`,
      districtId: input.districtId,
      landmark: input.landmark.trim(),
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

  /** Reports for a district, most severe first, then most recently confirmed. */
  active(districtId: string, _now: Date): Report[] {
    return this.reports
      .filter((r) => r.districtId === districtId)
      .sort((a, b) => b.severity - a.severity || b.lastConfirmedAt.getTime() - a.lastConfirmedAt.getTime())
  }
}
