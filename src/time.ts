const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000 // Thailand is UTC+7 all year (no DST)

/** Show a stored UTC time in Bangkok time, e.g. 2026-09-30T12:00:00Z -> "2026-09-30T19:00:00+07:00". */
export function toBangkokIso(date: Date): string {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MS)
  return local.toISOString().replace(/\.\d{3}Z$/, "+07:00")
}
