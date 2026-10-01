import { toBangkokIso } from "./time.ts"

export const REPORT_NOTICE = "ผู้ใช้รายงาน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"

export type SeverityLevel = "wet" | "hard-for-small-cars" | "unsafe-for-small-cars" | "dangerous"
export type Severity = { level: SeverityLevel; labelTh: string }

/** Passed validation. Values are already normalized. */
export type ValidReportInput = {
  landmark: string // display form: NFC, trimmed, whitespace collapsed
  depthCm: number // integer 0–300, -0 stored as 0
  seenAt: Date // UTC
  phone?: string // "0XXXXXXXXX"
}

/** Error text per code (RPT-REQ-019). The only place these strings live. Never echoes client input. */
export const MESSAGES_TH = {
  "not-object": "ข้อมูลที่ส่งมาต้องเป็น JSON object",
  "unknown-field": "ไม่รู้จักข้อมูลช่องนี้",
  required: "ต้องกรอกช่องนี้",
  "not-string": "ต้องเป็นข้อความ",
  "control-char": "มีอักขระที่ใช้ไม่ได้",
  empty: "ต้องกรอกจุดสังเกต",
  "too-long": "จุดสังเกตยาวได้ไม่เกิน 120 ตัวอักษร",
  "private-address": "กรุณาระบุสถานที่สาธารณะ เช่น ปากซอย สะพาน หรือห้าง แทนบ้านเลขที่หรือที่อยู่ส่วนตัว",
  "contact-info": "ห้ามใส่เบอร์โทรหรือช่องทางติดต่อในจุดสังเกต",
  link: "ห้ามใส่ลิงก์ในจุดสังเกต",
  "not-integer": "ความลึกต้องเป็นจำนวนเต็มหน่วยเซนติเมตร",
  "out-of-range": "ความลึกต้องอยู่ระหว่าง 0 ถึง 300 ซม.",
  "invalid-format": "เวลาต้องอยู่ในรูปแบบ 2026-09-30T19:00:00+07:00",
  "in-future": "เวลาที่เห็นต้องไม่อยู่ในอนาคต",
  "too-old": "รับเฉพาะน้ำท่วมที่เห็นภายใน 6 ชั่วโมง",
  "invalid-phone": "เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0"
} as const

export type ErrorCode = keyof typeof MESSAGES_TH
export type FieldError = { code: ErrorCode; messageTh: string }
export type ValidationResult = { ok: true; value: ValidReportInput } | { ok: false; fields: Record<string, FieldError> }

type Checked<T> = { ok: true; value: T } | { ok: false; code: ErrorCode }

export const MAX_DEPTH_CM = 300
export const MAX_SEEN_AGE_MS = 6 * 60 * 60 * 1000

/** Integer 0–300 cm. Strings are not converted. -0 becomes 0 (RPT-REQ-006). */
function checkDepth(raw: unknown): Checked<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false, code: "not-integer" }
  if (raw < 0 || raw > MAX_DEPTH_CM) return { ok: false, code: "out-of-range" }
  return { ok: true, value: raw + 0 }
}

const SEEN_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

/** Parse by the spec regex and range checks, never by new Date(string). Returns UTC or null. */
function parseSeenAt(raw: string): Date | null {
  const m = SEEN_AT_PATTERN.exec(raw)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  const ms = m[7] ? Number(m[7].slice(1).padEnd(3, "0")) : 0
  const zone = m[8] ?? "Z"
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null

  let offsetMin = 0
  if (zone !== "Z") {
    const offHour = Number(zone.slice(1, 3))
    const offMin = Number(zone.slice(4, 6))
    if (offHour > 14 || offMin > 59) return null
    offsetMin = (zone[0] === "-" ? -1 : 1) * (offHour * 60 + offMin)
  }

  // Read the calendar date back to reject days that do not exist, e.g. 2026-02-30.
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms))
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return null
  return new Date(local.getTime() - offsetMin * 60 * 1000)
}

/** Valid timestamp, not after now, not more than 6 h before now (RPT-REQ-007). */
function checkSeenAt(raw: unknown, now: Date): Checked<Date> {
  if (typeof raw !== "string") return { ok: false, code: "not-string" }
  const seenAt = parseSeenAt(raw)
  if (!seenAt) return { ok: false, code: "invalid-format" }
  if (seenAt.getTime() > now.getTime()) return { ok: false, code: "in-future" }
  if (now.getTime() - seenAt.getTime() > MAX_SEEN_AGE_MS) return { ok: false, code: "too-old" }
  return { ok: true, value: seenAt }
}

export const MAX_LANDMARK_GRAPHEMES = 120

// \p{C}: control, format (zero-width, RTL override), surrogate, private use, unassigned.
// U+2028/U+2029 are line/paragraph separators, not in \p{C}, but break a line just the same.
const CONTROL_CHAR = /[\p{C}\u2028\u2029]/u
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" })

/** The form stored and shown: NFC, trimmed, runs of whitespace collapsed to one space. */
export function displayLandmark(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ")
}

/** String, no control chars (checked before trim), 1–120 graphemes after collapsing (RPT-REQ-004). */
function checkLandmark(raw: unknown): Checked<string> {
  if (typeof raw !== "string") return { ok: false, code: "not-string" }
  if (CONTROL_CHAR.test(raw.normalize("NFC"))) return { ok: false, code: "control-char" }
  const display = displayLandmark(raw)
  if (display === "") return { ok: false, code: "empty" }
  if ([...graphemes.segment(display)].length > MAX_LANDMARK_GRAPHEMES) return { ok: false, code: "too-long" }
  return { ok: true, value: display }
}

/**
 * Optional Thai number (RPT-REQ-008). Missing, null or "" means no phone.
 * Otherwise strip whitespace and "-", then it must be 0 plus 9 digits. The error never echoes the value.
 */
function checkPhone(raw: unknown): Checked<string | undefined> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: undefined }
  if (typeof raw !== "string") return { ok: false, code: "invalid-phone" }
  const digits = raw.replace(/[\s-]/g, "")
  if (!/^0\d{9}$/.test(digits)) return { ok: false, code: "invalid-phone" }
  return { ok: true, value: digits }
}

const KNOWN_FIELDS: readonly string[] = ["landmark", "depthCm", "seenAt", "phone"]
const REQUIRED_FIELDS = ["landmark", "depthCm", "seenAt"] as const

/** Check the whole body and return every wrong field, one code each (RPT-REQ-003, 019). */
export function validateReport(body: unknown, now: Date): ValidationResult {
  // Null prototype, so a "__proto__" key is stored as a plain field, not as the prototype.
  const fields: Record<string, FieldError> = Object.create(null)
  const fail = (field: string, code: ErrorCode) => {
    fields[field] = { code, messageTh: MESSAGES_TH[code] }
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    fail("_body", "not-object")
    return { ok: false, fields }
  }
  const b = body as Record<string, unknown>

  for (const key of Object.keys(b)) {
    if (!KNOWN_FIELDS.includes(key)) fail(key, "unknown-field")
  }
  for (const key of REQUIRED_FIELDS) {
    if (!Object.hasOwn(b, key) || b[key] === null) fail(key, "required")
  }

  /** Runs one field's check unless that field already failed. */
  const check = <T>(key: string, fn: (raw: unknown) => Checked<T>): T | undefined => {
    if (Object.hasOwn(fields, key)) return undefined
    const result = fn(b[key])
    if (result.ok) return result.value
    fail(key, result.code)
    return undefined
  }
  const landmark = check("landmark", checkLandmark)
  const depthCm = check("depthCm", checkDepth)
  const seenAt = check("seenAt", (raw) => checkSeenAt(raw, now))
  const phone = check("phone", checkPhone)

  if (Object.keys(fields).length > 0 || landmark === undefined || depthCm === undefined || seenAt === undefined) {
    return { ok: false, fields }
  }

  const value: ValidReportInput = { landmark, depthCm, seenAt }
  if (phone !== undefined) value.phone = phone
  return { ok: true, value }
}

/** One accepted POST. Internal only: holds personal data. */
type Submission = {
  id: string
  depthCm: number
  seenAt: Date
  receivedAt: Date // ctx.now at submit; tie-breaker for "latest"
  landmark: string
  phone?: string // only copy of the phone anywhere in the app
}

/** Duplicates grouped together. Internal only. */
type ReportGroup = {
  id: string // public report id, own newId(), not a submission id
  districtId: string
  landmarkKey: string
  createdAt: Date
  submissions: Submission[]
}

/** What the public API returns. No phone or IP on purpose. */
export type PublicReport = {
  id: string
  districtId: string
  landmark: string
  depthCm: number
  seenAt: string // +07:00 via toBangkokIso
  severity: Severity
  confirmations: number
  source: "user-report"
  disclaimer: typeof REPORT_NOTICE
}

export type SubmitResult = { report: PublicReport; merged: boolean; submissionId: string }

export type ReportStore = {
  submit(districtId: string, input: ValidReportInput, now: Date, newId: () => string): SubmitResult
  listByDistrict(districtId: string, now: Date): PublicReport[]
}

/** Lowest depth (cm) for each level, deepest first. The only place these thresholds live. */
const SEVERITY_LEVELS: readonly { minCm: number; level: SeverityLevel; labelTh: string }[] = [
  { minCm: 50, level: "dangerous", labelTh: "อันตราย" },
  { minCm: 30, level: "unsafe-for-small-cars", labelTh: "รถเล็กไม่ควรผ่าน" },
  { minCm: 10, level: "hard-for-small-cars", labelTh: "รถเล็กผ่านลำบาก" },
  { minCm: 0, level: "wet", labelTh: "ถนนเปียก" }
]

export function severityOf(depthCm: number): Severity {
  const match = SEVERITY_LEVELS.find((s) => depthCm >= s.minCm) ?? SEVERITY_LEVELS[SEVERITY_LEVELS.length - 1]!
  return { level: match.level, labelTh: match.labelTh }
}

export const MERGE_WINDOW_MS = 60 * 60 * 1000

/** Key used to match duplicate landmarks: NFKC, Thai digits to Arabic, lower case (RPT-REQ-012). */
export function landmarkKey(display: string): string {
  return display
    .normalize("NFKC")
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .toLowerCase()
}

/** Expired means more than 6 h old; exactly 6 h is still live (RPT-REQ-013). */
function isLive(s: Submission, now: Date): boolean {
  return now.getTime() - s.seenAt.getTime() <= MAX_SEEN_AGE_MS
}

/** Latest submission by seenAt, then receivedAt. */
function latestOf(subs: Submission[]): Submission {
  return subs.reduce((a, b) => {
    const bySeen = b.seenAt.getTime() - a.seenAt.getTime()
    if (bySeen !== 0) return bySeen > 0 ? b : a
    return b.receivedAt.getTime() > a.receivedAt.getTime() ? b : a
  })
}

function lastReceivedAt(subs: Submission[]): number {
  return Math.max(...subs.map((s) => s.receivedAt.getTime()))
}

/** A group with its live submissions only. `subs` is empty when the group has expired. */
type LiveGroup = { group: ReportGroup; subs: Submission[] }

/** seenAt newest first, then latest receivedAt newest first, then id ascending (RPT-REQ-010). */
function compareLive(a: LiveGroup, b: LiveGroup): number {
  const bySeen = latestOf(b.subs).seenAt.getTime() - latestOf(a.subs).seenAt.getTime()
  if (bySeen !== 0) return bySeen
  const byReceived = lastReceivedAt(b.subs) - lastReceivedAt(a.subs)
  if (byReceived !== 0) return byReceived
  return a.group.id < b.group.id ? -1 : a.group.id > b.group.id ? 1 : 0
}

/** Build a new object field by field. Never spread internal records: they hold personal data. */
function toPublic({ group, subs }: LiveGroup): PublicReport {
  const latest = latestOf(subs)
  return {
    id: group.id,
    districtId: group.districtId,
    landmark: latest.landmark,
    depthCm: latest.depthCm,
    seenAt: toBangkokIso(latest.seenAt),
    severity: severityOf(latest.depthCm),
    confirmations: subs.length,
    source: "user-report",
    disclaimer: REPORT_NOTICE
  }
}

/** In-memory only. */
export function createReportStore(): ReportStore {
  const groups: ReportGroup[] = []

  const live = (group: ReportGroup, now: Date): LiveGroup => ({
    group,
    subs: group.submissions.filter((s) => isLive(s, now))
  })

  /** Closest latest seenAt within the window; ties go to the newer seenAt, then the older group (RPT-REQ-012). */
  function findMergeTarget(districtId: string, key: string, seenAt: Date, now: Date): LiveGroup | undefined {
    let best: { lg: LiveGroup; delta: number; latestSeen: number } | undefined
    for (const g of groups) {
      if (g.districtId !== districtId || g.landmarkKey !== key) continue
      const lg = live(g, now)
      if (lg.subs.length === 0) continue
      const latestSeen = latestOf(lg.subs).seenAt.getTime()
      const delta = Math.abs(seenAt.getTime() - latestSeen)
      if (delta > MERGE_WINDOW_MS) continue
      if (!best || delta < best.delta || (delta === best.delta && latestSeen > best.latestSeen)) {
        best = { lg, delta, latestSeen }
      }
    }
    return best?.lg
  }

  return {
    submit(districtId, input, now, newId) {
      const key = landmarkKey(input.landmark)
      const target = findMergeTarget(districtId, key, input.seenAt, now)
      const group: ReportGroup = target?.group ?? {
        id: newId(),
        districtId,
        landmarkKey: key,
        createdAt: now,
        submissions: []
      }
      const submission: Submission = {
        id: newId(),
        depthCm: input.depthCm,
        seenAt: input.seenAt,
        receivedAt: now,
        landmark: input.landmark
      }
      if (input.phone !== undefined) submission.phone = input.phone
      group.submissions.push(submission)
      if (!target) groups.push(group)
      return { report: toPublic(live(group, now)), merged: target !== undefined, submissionId: submission.id }
    },

    listByDistrict(districtId, now) {
      return groups
        .filter((g) => g.districtId === districtId)
        .map((g) => live(g, now))
        .filter((lg) => lg.subs.length > 0)
        .sort(compareLive)
        .map(toPublic)
    }
  }
}
