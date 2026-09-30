import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { districts } from "../src/districts.ts"
import { createReportStore, displayLandmark, MESSAGES_TH, type PublicReport, REPORT_NOTICE, severityOf } from "../src/reports.ts"
import { makeCtx, now } from "./helpers.ts"

const PATH = "/districts/lat-phrao/reports"
const validBody = () => ({ landmark: "หน้าปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T19:00:00+07:00" })

type ReportBody = { notice: string; reportNotice: string; merged: boolean; report: Record<string, unknown> }

describe("RPT-REQ-001 POST /districts/:id/reports", () => {
  it("returns 201 with notices and merged at the top level", () => {
    const res = handle("POST", PATH, validBody(), makeCtx())
    expect(res.status).toBe(201)
    const body = res.body as ReportBody
    expect(body.notice).toBe(NOTICE)
    expect(body.reportNotice).toBe(REPORT_NOTICE)
    expect(body.merged).toBe(false)
    expect(body.report).toEqual({
      id: "id-1",
      districtId: "lat-phrao",
      landmark: "หน้าปากซอยลาดพร้าว 71",
      depthCm: 35,
      seenAt: "2026-09-30T19:00:00+07:00",
      severity: { level: "unsafe-for-small-cars", labelTh: "รถเล็กไม่ควรผ่าน" },
      confirmations: 1,
      source: "user-report",
      disclaimer: REPORT_NOTICE
    })
  })

  it("report has exactly the public keys", () => {
    const res = handle("POST", PATH, validBody(), makeCtx())
    expect(Object.keys((res.body as ReportBody).report).sort()).toEqual(
      ["confirmations", "depthCm", "disclaimer", "districtId", "id", "landmark", "seenAt", "severity", "source"]
    )
  })
})

describe("RPT-REQ-009 severity from depth", () => {
  it.each([
    [0, "wet", "ถนนเปียก"],
    [9, "wet", "ถนนเปียก"],
    [10, "hard-for-small-cars", "รถเล็กผ่านลำบาก"],
    [29, "hard-for-small-cars", "รถเล็กผ่านลำบาก"],
    [30, "unsafe-for-small-cars", "รถเล็กไม่ควรผ่าน"],
    [49, "unsafe-for-small-cars", "รถเล็กไม่ควรผ่าน"],
    [50, "dangerous", "อันตราย"],
    [300, "dangerous", "อันตราย"]
  ])("%i cm is %s", (depthCm, level, labelTh) => {
    expect(severityOf(depthCm)).toEqual({ level, labelTh })
  })
})

describe("RPT-REQ-011 user-report label", () => {
  it("report says it is user-reported", () => {
    const res = handle("POST", PATH, validBody(), makeCtx())
    const report = (res.body as ReportBody).report
    expect(report.source).toBe("user-report")
    expect(report.disclaimer).toBe(REPORT_NOTICE)
  })
})

describe("id order", () => {
  it("gives the report its id before the submission", () => {
    let n = 0
    const newId = () => `id-${++n}`
    const input = { landmark: "หน้าปากซอยลาดพร้าว 71", depthCm: 35, seenAt: new Date("2026-09-30T12:00:00Z") }
    const result = createReportStore().submit("lat-phrao", input, now, newId)
    expect(result.report.id).toBe("id-1")
    expect(result.submissionId).toBe("id-2")
  })
})

describe("RPT-REQ-010 reports show in GET /districts/:id", () => {
  type DistrictBody = { reportNotice: string; reports: Record<string, unknown>[] }
  const getReports = (id: string, ctx: ReturnType<typeof makeCtx>) =>
    (handle("GET", `/districts/${id}`, undefined, ctx).body as DistrictBody).reports

  it("shows the posted report right away", () => {
    const ctx = makeCtx()
    const posted = (handle("POST", PATH, validBody(), ctx).body as ReportBody).report
    expect(getReports("lat-phrao", ctx)[0]).toEqual(posted)
  })

  it("gives [] for a district with no reports and does not mix districts", () => {
    const ctx = makeCtx()
    handle("POST", PATH, validBody(), ctx)
    expect(getReports("bang-kapi", ctx)).toEqual([])
    expect(getReports("lat-phrao", ctx).map((r) => r.districtId)).toEqual(["lat-phrao"])
  })

  it("sorts by seenAt newest first, then receivedAt newest first, then id ascending", () => {
    const ctx = makeCtx()
    const post = (landmark: string, seenAt: string, at: Date = now) =>
      handle("POST", PATH, { landmark, depthCm: 10, seenAt }, { ...ctx, now: at })
    post("เก่า", "2026-09-30T17:00:00+07:00") // id-1
    post("ใหม่สุด", "2026-09-30T19:00:00+07:00") // id-3
    post("รับก่อน", "2026-09-30T18:00:00+07:00", new Date(now.getTime() - 1000)) // id-5
    post("รับทีหลัง ก", "2026-09-30T18:00:00+07:00") // id-7
    post("รับทีหลัง ข", "2026-09-30T18:00:00+07:00") // id-9
    expect(getReports("lat-phrao", ctx).map((r) => r.landmark)).toEqual(
      ["ใหม่สุด", "รับทีหลัง ก", "รับทีหลัง ข", "รับก่อน", "เก่า"]
    )
  })
})

describe("RPT-REQ-011 GET /districts/:id label", () => {
  it("has reportNotice next to notice", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, makeCtx())
    expect(res.body).toMatchObject({ notice: NOTICE, reportNotice: REPORT_NOTICE })
  })
})

describe("RPT-REQ-001 other methods at the report endpoint", () => {
  it.each(["GET", "PUT", "DELETE"])("%s gives 404 not found", (method) => {
    const res = handle(method, PATH, validBody(), makeCtx())
    expect(res).toEqual({ status: 404, body: { error: "not found" } })
  })
})

describe("RPT-REQ-002 district must be one of the 12", () => {
  it("unknown district gives 404 with notices and stores nothing", () => {
    const ctx = makeCtx()
    const res = handle("POST", "/districts/atlantis/reports", validBody(), ctx)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: "unknown district", notice: NOTICE, reportNotice: REPORT_NOTICE })
    expect(ctx.reports!.listByDistrict("atlantis", now)).toEqual([])
    // No id was used, so the next report is still id-1.
    const next = handle("POST", PATH, validBody(), ctx)
    expect((next.body as ReportBody).report.id).toBe("id-1")
  })

  it("uppercase district is not the report endpoint", () => {
    const res = handle("POST", "/districts/Lat-Phrao/reports", validBody(), makeCtx())
    expect(res).toEqual({ status: 404, body: { error: "not found" } })
  })

  it("accepts all 12 districts", () => {
    const ctx = makeCtx()
    const ids = [...districts.keys()]
    expect(ids).toHaveLength(12)
    ids.forEach((id, i) => {
      const res = handle("POST", `/districts/${id}/reports`, validBody(), { ...ctx, ip: `10.0.0.${i + 1}` })
      expect(res.status, id).toBe(201)
      expect((res.body as ReportBody).report.districtId).toBe(id)
    })
  })
})

type ErrorBody = { error: string; fields: Record<string, { code: string; messageTh: string }>; notice: string; reportNotice: string }
const post = (body: unknown, ctx = makeCtx()) => handle("POST", PATH, body, ctx)
const fieldsOf = (body: unknown, ctx = makeCtx()) => {
  const res = post(body, ctx)
  expect(res.status).toBe(400)
  return (res.body as ErrorBody).fields
}

describe("RPT-REQ-003 body shape", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["array", [validBody()]],
    ["string", "หน้าปากซอย"],
    ["number", 35]
  ])("%s body gives _body.not-object", (_name, body) => {
    expect(fieldsOf(body)).toEqual({ _body: { code: "not-object", messageTh: MESSAGES_TH["not-object"] } })
  })

  it.each(["severity", "id", "confirmations", "districtId", "merged"])("%s gives unknown-field", (name) => {
    expect(fieldsOf({ ...validBody(), [name]: "x" })[name]?.code).toBe("unknown-field")
  })

  it("__proto__ from JSON gives unknown-field", () => {
    const body = JSON.parse(
      '{"__proto__":{"x":1},"landmark":"หน้าปากซอยลาดพร้าว 71","depthCm":10,"seenAt":"2026-09-30T19:00:00+07:00"}'
    )
    const fields = fieldsOf(body)
    expect(Object.keys(fields)).toEqual(["__proto__"])
    expect(fields["__proto__"]?.code).toBe("unknown-field")
  })

  it.each(["landmark", "depthCm", "seenAt"])("missing or null %s gives required", (name) => {
    const missing: Record<string, unknown> = validBody()
    delete missing[name]
    expect(fieldsOf(missing)[name]?.code).toBe("required")
    expect(fieldsOf({ ...validBody(), [name]: null })[name]?.code).toBe("required")
  })

  it("reports every wrong field at once", () => {
    const fields = fieldsOf({ extra: 1 })
    expect(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.code]))).toEqual({
      extra: "unknown-field",
      landmark: "required",
      depthCm: "required",
      seenAt: "required"
    })
  })

  it("stores nothing and uses no id on 400", () => {
    const ctx = makeCtx()
    post({}, ctx)
    expect(ctx.reports!.listByDistrict("lat-phrao", now)).toEqual([])
    expect((post(validBody(), ctx).body as ReportBody).report.id).toBe("id-1")
  })
})

describe("RPT-REQ-019 error format", () => {
  it("messageTh table matches the spec exactly", () => {
    expect(MESSAGES_TH).toEqual({
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
    })
  })

  it("400 body is invalid report with both notices", () => {
    const res = post({ landmark: "หน้าปากซอย", seenAt: "2026-09-30T19:00:00+07:00" })
    expect(res).toEqual({
      status: 400,
      body: {
        error: "invalid report",
        fields: { depthCm: { code: "required", messageTh: "ต้องกรอกช่องนี้" } },
        notice: NOTICE,
        reportNotice: REPORT_NOTICE
      }
    })
  })
})

const codeFor = (field: string, value: unknown) => fieldsOf({ ...validBody(), [field]: value })[field]?.code
const accepted = (field: string, value: unknown) => {
  const res = post({ ...validBody(), [field]: value })
  expect(res.status).toBe(201)
  return (res.body as ReportBody).report
}

describe("RPT-REQ-006 depth is an integer 0–300 cm", () => {
  it.each([0, 1, 299, 300])("%i passes", (depthCm) => {
    expect(accepted("depthCm", depthCm).depthCm).toBe(depthCm)
  })

  it.each([-1, 301])("%i is out-of-range", (depthCm) => {
    expect(codeFor("depthCm", depthCm)).toBe("out-of-range")
  })

  it.each([
    ["30.5", 30.5],
    ["Infinity", JSON.parse("1e400")],
    ["NaN", NaN],
    ['"30"', "30"],
    ["true", true]
  ])("%s is not-integer", (_name, depthCm) => {
    expect(codeFor("depthCm", depthCm)).toBe("not-integer")
  })

  it("-0 is stored as 0", () => {
    expect(Object.is(accepted("depthCm", -0).depthCm, 0)).toBe(true)
  })
})

describe("RPT-REQ-007 seenAt", () => {
  it.each(["2026-09-30T19:00:00+07:00", "2026-09-30T12:00:00Z", "2026-09-30T12:00:00.500Z"])("%s passes", (seenAt) => {
    expect(accepted("seenAt", seenAt).seenAt).toBe("2026-09-30T19:00:00+07:00")
  })

  it.each([
    "2026-09-30T19:00:00",
    "2026-09-30T19:00+07:00",
    "2026-09-30T12:00:00z",
    "2026-09-30T19:00:00+0700",
    "2026-09-30",
    "เมื่อกี้",
    "",
    " 2026-09-30T12:00:00Z",
    "2026-09-30T12:00:00.1234Z",
    "2026-02-30T12:00:00Z",
    "2026-13-01T12:00:00Z",
    "2026-09-30T24:00:00Z",
    "2026-09-30T12:60:00Z",
    "2026-09-30T12:00:60Z",
    "2026-09-30T12:00:00+15:00",
    "2026-09-30T12:00:00+07:60"
  ])("%j is invalid-format", (seenAt) => {
    expect(codeFor("seenAt", seenAt)).toBe("invalid-format")
  })

  it("a number is not-string", () => {
    expect(codeFor("seenAt", 1759233600000)).toBe("not-string")
  })

  it("now passes, now + 1 ms is in-future", () => {
    expect(accepted("seenAt", "2026-09-30T12:30:00Z").seenAt).toBe("2026-09-30T19:30:00+07:00")
    expect(codeFor("seenAt", "2026-09-30T12:30:00.001Z")).toBe("in-future")
  })

  it("now - 6 h passes, now - 6 h - 1 ms is too-old", () => {
    expect(accepted("seenAt", "2026-09-30T06:30:00Z").seenAt).toBe("2026-09-30T13:30:00+07:00")
    expect(codeFor("seenAt", "2026-09-30T06:29:59.999Z")).toBe("too-old")
  })

  it("Z and +07:00 forms are stored as the same time", () => {
    const ctx = makeCtx()
    post({ ...validBody(), landmark: "ก", seenAt: "2026-09-30T12:00:00Z" }, ctx)
    post({ ...validBody(), landmark: "ข", seenAt: "2026-09-30T19:00:00+07:00" }, ctx)
    const reports = (handle("GET", "/districts/lat-phrao", undefined, ctx).body as { reports: { seenAt: string }[] }).reports
    expect(reports.map((r) => r.seenAt)).toEqual(["2026-09-30T19:00:00+07:00", "2026-09-30T19:00:00+07:00"])
  })
})

describe("RPT-REQ-004 landmark is 1–120 characters", () => {
  it.each([["123", 123], ['["a"]', ["a"]]])("%s is not-string", (_name, landmark) => {
    expect(codeFor("landmark", landmark)).toBe("not-string")
  })

  it.each(["", "   "])("%j is empty", (landmark) => {
    expect(codeFor("landmark", landmark)).toBe("empty")
  })

  it("120 graphemes pass, 121 is too-long", () => {
    expect(accepted("landmark", "ก".repeat(120)).landmark).toBe("ก".repeat(120))
    expect(codeFor("landmark", "ก".repeat(121))).toBe("too-long")
  })

  it('counts graphemes, not code points: "ที่" × 120 passes', () => {
    // "ที่" is one grapheme but three code points.
    const landmark = "ที่".repeat(120)
    expect(landmark.length).toBe(360)
    expect(accepted("landmark", landmark).landmark).toBe(landmark)
    expect(codeFor("landmark", "ที่".repeat(121))).toBe("too-long")
  })

  it('the spec example "ที่" × 40 passes', () => {
    expect(accepted("landmark", "ที่".repeat(40)).landmark).toBe("ที่".repeat(40))
  })

  it("counts length after collapsing spaces", () => {
    expect(accepted("landmark", "ก".repeat(118) + "     " + "ข").landmark).toBe("ก".repeat(118) + " ข")
    expect(codeFor("landmark", "ก".repeat(119) + "  " + "ข")).toBe("too-long")
  })

  it.each([
    ["\n", "หน้า\nซอย"],
    ["leading \n", "\nหน้าซอย"],
    ["\t", "หน้า\tซอย"],
    ["\u0000", "หน้า\u0000ซอย"],
    ["U+200B", "หน้า\u200Bซอย"],
    ["U+202E", "หน้า\u202Eซอย"],
    ["U+2028", "หน้า\u2028ซอย"],
    ["U+2029", "หน้า\u2029ซอย"]
  ])("%s is control-char", (_name, landmark) => {
    expect(codeFor("landmark", landmark)).toBe("control-char")
  })

  it("stores the display form", () => {
    expect(accepted("landmark", "  หน้า   เซ็นทรัล ").landmark).toBe("หน้า เซ็นทรัล")
  })

  it("displayLandmark normalizes to NFC", () => {
    expect(displayLandmark("e\u0301")).toBe("\u00e9")
  })
})

describe("RPT-REQ-008 phone is optional, Thai 10 digits only", () => {
  it("no phone, null and empty string pass", () => {
    expect(post(validBody()).status).toBe(201)
    expect(post({ ...validBody(), phone: null }).status).toBe(201)
    expect(post({ ...validBody(), phone: "" }).status).toBe(201)
  })

  it.each(["0000000000", "000-000-0000", "000 000 0000"])("%j passes", (phone) => {
    expect(post({ ...validBody(), phone }).status).toBe(201)
  })

  it.each([
    ["9 digits", "000000000"],
    ["+66", "+66000000000"],
    ["letters", "abc"],
    ["number", 12345],
    ["spaces only", "   "],
    ["11 digits", "00000000000"],
    ["boolean", true]
  ])("%s is invalid-phone and the message does not echo it", (_name, phone) => {
    const fields = fieldsOf({ ...validBody(), phone })
    expect(fields.phone).toEqual({ code: "invalid-phone", messageTh: MESSAGES_TH["invalid-phone"] })
    expect(JSON.stringify(fields)).not.toContain(String(phone).trim() || "   ")
  })
})

describe("RPT-REQ-015 phone never leaves the server", () => {
  it("no response contains the phone or a phone key", () => {
    const ctx = makeCtx()
    // Landmark has no run of zeros, so a match could only be the phone.
    const body = { landmark: "หน้าตลาดนัด", depthCm: 12, seenAt: "2026-09-30T19:00:00+07:00", phone: "0000000000" }
    const responses = [
      post(body, ctx),
      handle("GET", "/districts", undefined, ctx),
      handle("GET", "/districts/lat-phrao", undefined, ctx),
      post({ ...body, depthCm: 999 }, ctx)
    ]
    expect(responses.map((r) => r.status)).toEqual([201, 200, 200, 400])
    for (const res of responses) {
      const json = JSON.stringify(res)
      expect(json).not.toContain("0000000000")
      expect(json).not.toContain('"phone"')
    }
  })

  it("PublicReport has no phone field (checked by tsc)", () => {
    const report: PublicReport = accepted("phone", "0000000000") as unknown as PublicReport
    // @ts-expect-error PublicReport must not have phone
    expect(report.phone).toBeUndefined()
  })
})

describe("RPT-REQ-021 IP never leaves the server", () => {
  it("no response contains the IP", () => {
    const ctx = makeCtx({ ip: "203.0.113.7" })
    const responses = [
      post(validBody(), ctx),
      post({}, ctx),
      handle("POST", "/districts/atlantis/reports", validBody(), ctx),
      handle("GET", "/districts/lat-phrao", undefined, ctx),
      handle("GET", "/districts", undefined, ctx)
    ]
    for (const res of responses) expect(JSON.stringify(res)).not.toContain("203.0.113.7")
  })
})
