import { describe, expect, it } from "vitest"
import { BODY_TOO_LARGE, handle, INVALID_JSON, NOTICE } from "../src/app.ts"
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
    [24, "hard-for-small-cars", "รถเล็กผ่านลำบาก"],
    [25, "unsafe-for-small-cars", "รถเล็กไม่ควรผ่าน"],
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

  it("1e21 is out-of-range", () => {
    expect(codeFor("depthCm", 1e21)).toBe("out-of-range")
  })

  it.each([
    ["30.5", 30.5],
    ["Infinity", JSON.parse("1e400")],
    ["-Infinity", -Infinity],
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

  it.each([
    ["negative offset", "2026-09-30T07:00:00-05:00"],
    ["offset with minutes", "2026-09-30T17:30:00+05:30"],
    ["one fraction digit", "2026-09-30T12:00:00.5Z"],
    ["two fraction digits", "2026-09-30T12:00:00.05Z"]
  ])("%s passes: %s", (_name, seenAt) => {
    expect(accepted("seenAt", seenAt).seenAt).toBe("2026-09-30T19:00:00+07:00")
  })

  it("a year below 100 is read as written, so it is too-old, not invalid-format", () => {
    expect(codeFor("seenAt", "0099-09-30T12:00:00Z")).toBe("too-old")
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

describe("RPT-REQ-005 no private address, contact or link in the landmark", () => {
  it.each([
    ["private-address", "บ้านเลขที่ 5 ซอยลาดพร้าว 71"],
    ["private-address", "เลขที่ 12"],
    ["private-address", "เลขที่๑๒"],
    ["private-address", "99/12 หมู่บ้านสุขใจ"],
    ["private-address", "99 / 12"],
    ["private-address", "๙๙/๑๒"],
    ["private-address", "๙๙ / ๑๒"],
    ["private-address", "99／12"],
    ["private-address", "คอนโด A ห้อง 1204"],
    ["private-address", "หมู่ที่ 5 บางเขน"],
    ["private-address", "99 ม.3"],
    ["contact-info", "หน้าร้าน โทร 000 000 0000"],
    ["contact-info", "0-0000-0000"],
    ["contact-info", "ติดต่อ @someone"],
    ["link", "ดูที่ www.example.com"],
    ["link", "bit.ly/xyz"]
  ])("%s: %j", (code, landmark) => {
    expect(codeFor("landmark", landmark)).toBe(code)
  })

  it.each(["หน้าปากซอยลาดพร้าว 71", "ใต้สะพานข้ามแยก", "หน้าเซ็นทรัลลาดพร้าว", "ถนนพหลโยธิน กม. 12", "ซอยรามคำแหง 24 แยก 7"])(
    "%j passes",
    (landmark) => {
      expect(accepted("landmark", landmark).landmark).toBe(landmark)
    }
  )

  it('"ซอยลาดพร้าว 71/1" is rejected (accepted false positive, EC-08)', () => {
    expect(codeFor("landmark", "ซอยลาดพร้าว 71/1")).toBe("private-address")
  })

  it("the first matching row wins: an address with a phone is private-address", () => {
    expect(codeFor("landmark", "บ้านเลขที่ 5 โทร 0000000000")).toBe("private-address")
  })

  it("messageTh does not echo the landmark", () => {
    const landmark = "ติดต่อ @someone"
    const fields = fieldsOf({ ...validBody(), landmark })
    expect(fields.landmark).toEqual({ code: "contact-info", messageTh: MESSAGES_TH["contact-info"] })
    expect(JSON.stringify(fields)).not.toContain("someone")
  })

  it("a rejected landmark is not stored and does not show in GET", () => {
    const ctx = makeCtx()
    post({ ...validBody(), landmark: "บ้านเลขที่ 5" }, ctx)
    expect(ctx.reports!.submissionIds()).toEqual([])
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

  it("a wrong phone rejects the whole report and stores nothing (EC-12)", () => {
    const ctx = makeCtx()
    expect(post({ ...validBody(), phone: "000000000" }, ctx).status).toBe(400)
    expect(ctx.reports!.submissionIds()).toEqual([])
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

describe("RPT-REQ-009 severity boundaries are in different levels", () => {
  it.each([[9, 10], [24, 25], [49, 50]])("%i cm and %i cm differ", (below, at) => {
    expect(severityOf(below).level).not.toBe(severityOf(at).level)
  })

  it.each([-1, 301, 12.5, NaN])("%s throws instead of guessing a level", (depthCm) => {
    expect(() => severityOf(depthCm)).toThrow(RangeError)
  })
})

describe("RPT-REQ-012 merging duplicate reports", () => {
  type ListBody = { reports: { id: string; depthCm: number; confirmations: number }[] }
  const LANDMARK = "หน้าปากซอยลาดพร้าว 71"
  const send = (ctx: ReturnType<typeof makeCtx>, depthCm: number, seenAt: string) =>
    handle("POST", PATH, { landmark: LANDMARK, depthCm, seenAt }, ctx)
  const list = (ctx: ReturnType<typeof makeCtx>) =>
    (handle("GET", "/districts/lat-phrao", undefined, ctx).body as ListBody).reports

  it("same spot, same district within the window becomes one report with the latest depth", () => {
    const ctx = makeCtx()
    const first = send(ctx, 20, "2026-09-30T18:30:00+07:00").body as ReportBody
    const second = send(ctx, 40, "2026-09-30T19:00:00+07:00")
    const body = second.body as ReportBody
    expect(second.status).toBe(201)
    expect(body.merged).toBe(true)
    expect(body.report.id).toBe(first.report.id)
    expect(body.report.depthCm).toBe(40)
    expect(body.report.confirmations).toBe(2)
    expect(list(ctx)).toHaveLength(1)
    expect(list(ctx)[0]).toMatchObject({ depthCm: 40, confirmations: 2 })
  })

  it("exactly at the window edge still merges", () => {
    const ctx = makeCtx()
    send(ctx, 20, "2026-09-30T11:30:00Z")
    const res = send(ctx, 20, "2026-09-30T12:30:00Z")
    expect((res.body as ReportBody).merged).toBe(true)
    expect(list(ctx)).toHaveLength(1)
  })

  it("one millisecond past the window is a new report", () => {
    const ctx = makeCtx()
    const first = send(ctx, 20, "2026-09-30T11:29:59.999Z").body as ReportBody
    const res = send(ctx, 20, "2026-09-30T12:30:00Z")
    const body = res.body as ReportBody
    expect(body.merged).toBe(false)
    expect(body.report.id).not.toBe(first.report.id)
    expect(list(ctx)).toHaveLength(2)
  })
})

describe("RPT-REQ-013 expired reports are not listed", () => {
  const at = (iso: string) => new Date(iso)
  const listAt = (ctx: ReturnType<typeof makeCtx>, time: Date) =>
    (handle("GET", "/districts/lat-phrao", undefined, { ...ctx, now: time }).body as { reports: unknown[] }).reports

  it("still shown 6 h after the last confirmation, gone 1 ms later", () => {
    const ctx = makeCtx()
    expect(post({ ...validBody(), seenAt: "2026-09-30T12:00:00Z" }, { ...ctx, now: at("2026-09-30T12:00:00Z") }).status).toBe(201)
    expect(listAt(ctx, at("2026-09-30T18:00:00Z"))).toHaveLength(1)
    expect(listAt(ctx, at("2026-09-30T18:00:00.001Z"))).toHaveLength(0)
  })

  it("a merged report expires by its latest seenAt", () => {
    const ctx = makeCtx()
    post({ ...validBody(), seenAt: "2026-09-30T06:30:00Z" }, ctx)
    expect((post({ ...validBody(), seenAt: "2026-09-30T07:00:00Z" }, ctx).body as ReportBody).merged).toBe(true)
    const stillThere = listAt(ctx, at("2026-09-30T13:00:00Z")) as { confirmations: number }[]
    expect(stillThere).toHaveLength(1)
    expect(stillThere[0]?.confirmations).toBe(1)
    expect(listAt(ctx, at("2026-09-30T13:00:00.001Z"))).toHaveLength(0)
  })

  it("expired submissions are not counted in confirmations", () => {
    const ctx = makeCtx()
    for (const seenAt of ["2026-09-30T06:40:00Z", "2026-09-30T07:30:00Z", "2026-09-30T08:20:00Z"]) {
      post({ ...validBody(), seenAt }, ctx)
    }
    const reports = listAt(ctx, at("2026-09-30T12:41:00Z")) as { confirmations: number }[]
    expect(reports).toHaveLength(1)
    expect(reports[0]?.confirmations).toBe(2)
  })

  it("a new submission does not merge into an expired report", () => {
    const ctx = makeCtx()
    const first = post({ ...validBody(), seenAt: "2026-09-30T06:30:00Z" }, ctx).body as ReportBody
    const later = post({ ...validBody(), seenAt: "2026-09-30T07:00:00Z" }, { ...ctx, now: at("2026-09-30T12:31:00Z") })
    const body = later.body as ReportBody
    expect(later.status).toBe(201)
    expect(body.merged).toBe(false)
    expect(body.report.id).not.toBe(first.report.id)
  })

  it("a report confirmed every 50 min stays, but each old submission is dropped (EC-05)", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    const start = at("2026-09-30T12:30:00Z").getTime()
    const times = Array.from({ length: 9 }, (_, i) => new Date(start + i * 50 * 60 * 1000))
    for (const time of times) {
      const res = post({ ...validBody(), seenAt: time.toISOString() }, { ...ctx, now: time })
      expect(res.status).toBe(201)
    }
    const last = times[times.length - 1]!
    const reports = listAt(ctx, last) as { id: string; confirmations: number }[]
    expect(reports).toHaveLength(1)
    expect(reports[0]?.confirmations).toBe(8)
    // id-1 is the report, id-2 the first submission (seenAt 12:30Z, more than 6 h before 19:10Z).
    expect(ctx.reports!.submissionIds()).not.toContain("id-2")
    expect(ctx.reports!.submissionIds()).toHaveLength(8)
  })
})

describe("RPT-REQ-012 merging: the rest of the acceptance criteria", () => {
  type ListBody = { reports: { id: string; landmark: string; seenAt: string; depthCm: number; confirmations: number }[] }
  const sendAt = (ctx: ReturnType<typeof makeCtx>, landmark: string, depthCm: number, seenAt: string, path = PATH) =>
    handle("POST", path, { landmark, depthCm, seenAt }, ctx).body as ReportBody
  const list = (ctx: ReturnType<typeof makeCtx>, district = "lat-phrao") =>
    (handle("GET", `/districts/${district}`, undefined, ctx).body as ListBody).reports

  it("spaces and Thai digits match; the latest submission is shown", () => {
    const ctx = makeCtx()
    const first = sendAt(ctx, "หน้าปากซอยลาดพร้าว 71", 20, "2026-09-30T18:30:00+07:00")
    const second = sendAt(ctx, "  หน้าปากซอยลาดพร้าว   ๗๑ ", 40, "2026-09-30T19:00:00+07:00")
    expect(second.merged).toBe(true)
    expect(second.report.id).toBe(first.report.id)
    expect(list(ctx)).toEqual([
      expect.objectContaining({
        confirmations: 2,
        depthCm: 40,
        seenAt: "2026-09-30T19:00:00+07:00",
        landmark: "หน้าปากซอยลาดพร้าว ๗๑"
      })
    ])
  })

  it('"Central Ladprao" and "central ladprao" merge', () => {
    const ctx = makeCtx()
    sendAt(ctx, "Central Ladprao", 20, "2026-09-30T18:30:00+07:00")
    expect(sendAt(ctx, "central ladprao", 20, "2026-09-30T18:40:00+07:00").merged).toBe(true)
  })

  it('a different spelling is a different spot: "ลาดพร้าว71" and "ลาดพร้าว 71" (EC-11)', () => {
    const ctx = makeCtx()
    sendAt(ctx, "ลาดพร้าว 71", 20, "2026-09-30T18:30:00+07:00")
    expect(sendAt(ctx, "ลาดพร้าว71", 20, "2026-09-30T18:40:00+07:00").merged).toBe(false)
  })

  it("the same landmark in another district does not merge", () => {
    const ctx = makeCtx()
    sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T18:30:00+07:00")
    expect(sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T18:40:00+07:00", "/districts/bang-kapi/reports").merged).toBe(false)
    expect(list(ctx)).toHaveLength(1)
    expect(list(ctx, "bang-kapi")).toHaveLength(1)
  })

  it("an older seenAt adds a confirmation but does not change what is shown (EC-06)", () => {
    const ctx = makeCtx()
    sendAt(ctx, "หน้าตลาด", 40, "2026-09-30T19:00:00+07:00")
    const late = sendAt(ctx, "หน้าตลาด", 10, "2026-09-30T18:30:00+07:00")
    expect(late.merged).toBe(true)
    expect(late.report).toMatchObject({ depthCm: 40, seenAt: "2026-09-30T19:00:00+07:00", confirmations: 2 })
  })

  it("picks the report with the smallest gap: 18:10 joins 17:30, not 19:15", () => {
    const ctx = makeCtx()
    const early = sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T17:30:00+07:00")
    const late = sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T19:15:00+07:00")
    expect(late.merged).toBe(false)
    expect(sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T18:10:00+07:00").report.id).toBe(early.report.id)
  })

  it("on an equal gap picks the newer report: 18:05 joins 18:40, not 17:30", () => {
    const ctx = makeCtx()
    sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T17:30:00+07:00")
    const newer = sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T18:40:00+07:00")
    expect(newer.merged).toBe(false)
    expect(sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T18:05:00+07:00").report.id).toBe(newer.report.id)
  })

  it("on an equal seenAt the later receivedAt is shown", () => {
    const ctx = makeCtx()
    sendAt(ctx, "หน้าตลาด", 20, "2026-09-30T19:00:00+07:00")
    const second = handle("POST", PATH, { landmark: "หน้าตลาด", depthCm: 60, seenAt: "2026-09-30T19:00:00+07:00" }, {
      ...ctx,
      now: new Date(now.getTime() + 1000)
    }).body as ReportBody
    expect(second.report).toMatchObject({ depthCm: 60, confirmations: 2 })
  })
})

describe("RPT-REQ-017 expired submissions and phones are deleted", () => {
  const after = new Date("2026-09-30T18:00:00.001Z")

  it("GET after expiry removes the submission", () => {
    const ctx = makeCtx()
    post({ ...validBody(), seenAt: "2026-09-30T12:00:00Z", phone: "0000000000" }, ctx)
    expect(ctx.reports!.submissionIds()).toEqual(["id-2"])
    handle("GET", "/districts/lat-phrao", undefined, { ...ctx, now: after })
    expect(ctx.reports!.submissionIds()).toEqual([])
  })

  it("purgeExpired does the same when called directly", () => {
    const ctx = makeCtx()
    post({ ...validBody(), seenAt: "2026-09-30T12:00:00Z", phone: "0000000000" }, ctx)
    ctx.reports!.purgeExpired(new Date("2026-09-30T18:00:00Z"))
    expect(ctx.reports!.submissionIds()).toEqual(["id-2"])
    ctx.reports!.purgeExpired(after)
    expect(ctx.reports!.submissionIds()).toEqual([])
  })

  it("a POST also purges", () => {
    const ctx = makeCtx()
    post({ ...validBody(), seenAt: "2026-09-30T12:00:00Z" }, ctx)
    post({ ...validBody(), landmark: "หน้าตลาด", seenAt: "2026-09-30T17:00:00Z" }, { ...ctx, now: after })
    expect(ctx.reports!.submissionIds()).toEqual(["id-4"])
  })

  it("submit refuses a seenAt that has already expired", () => {
    const input = { landmark: "หน้าตลาด", depthCm: 10, seenAt: new Date("2026-09-30T06:29:59.999Z") }
    expect(() => createReportStore().submit("lat-phrao", input, now, () => "x")).toThrow(RangeError)
  })
})

describe("RPT-REQ-016 log has IDs only", () => {
  const LOG = /^report accepted submission=\S+ report=\S+ district=[a-z-]+ merged=(true|false)$/

  it("a 201 returns a predictable log line", () => {
    const ctx = makeCtx()
    const res = post({ ...validBody(), phone: "0000000000" }, ctx)
    expect(res.log).toMatch(LOG)
    expect(res.log).toBe("report accepted submission=id-2 report=id-1 district=lat-phrao merged=false")
    expect(post(validBody(), ctx).log).toBe("report accepted submission=id-3 report=id-1 district=lat-phrao merged=true")
  })

  it("the log has no landmark, IP or phone", () => {
    const res = post({ ...validBody(), phone: "0000000000" }, makeCtx({ ip: "203.0.113.7" }))
    expect(res.log).not.toContain("ลาดพร้าว")
    expect(res.log).not.toContain("203.0.113.7")
    expect(res.log).not.toContain("0000000000")
  })

  it("no other response has a log", () => {
    const ctx = makeCtx({ ip: "10.0.0.1" })
    const responses = [
      post({}, ctx),
      handle("POST", "/districts/atlantis/reports", validBody(), ctx),
      post(BODY_TOO_LARGE, ctx),
      post(INVALID_JSON, ctx),
      post(validBody(), ctx),
      post(validBody(), ctx), // 6th: 429
      handle("GET", "/districts", undefined, ctx),
      handle("GET", "/districts/lat-phrao", undefined, ctx),
      handle("GET", "/nope", undefined, ctx)
    ]
    expect(responses.map((r) => r.status)).toEqual([400, 404, 413, 400, 201, 429, 200, 200, 404])
    for (const res of responses.filter((r) => r.status !== 201)) expect(res).not.toHaveProperty("log")
  })
})

describe("RPT-REQ-011 every report endpoint status has both notices", () => {
  const full = () => {
    const ctx = makeCtx({ ip: "10.0.0.9" })
    for (let i = 0; i < 5; i++) post({}, ctx)
    return ctx
  }
  it.each([
    [201, () => post(validBody())],
    [400, () => post({})],
    [400, () => post(INVALID_JSON)],
    [404, () => handle("POST", "/districts/atlantis/reports", validBody(), makeCtx())],
    [413, () => post(BODY_TOO_LARGE)],
    [429, () => post(validBody(), full())]
  ])("%i", (status, send) => {
    const res = send()
    expect(res.status).toBe(status)
    expect(res.body).toMatchObject({ notice: NOTICE, reportNotice: REPORT_NOTICE })
  })
})

describe("RPT-REQ-018 sentinels from the server", () => {
  it("BODY_TOO_LARGE at the report endpoint is 413 with notices", () => {
    expect(post(BODY_TOO_LARGE)).toEqual({
      status: 413,
      body: { error: "body too large", notice: NOTICE, reportNotice: REPORT_NOTICE }
    })
  })

  it("INVALID_JSON at the report endpoint is 400 with notices", () => {
    expect(post(INVALID_JSON)).toEqual({
      status: 400,
      body: { error: "invalid JSON", notice: NOTICE, reportNotice: REPORT_NOTICE }
    })
  })

  it("other paths keep the old shape", () => {
    expect(handle("GET", "/districts", INVALID_JSON, makeCtx())).toEqual({ status: 400, body: { error: "invalid JSON" } })
    expect(handle("GET", "/districts", BODY_TOO_LARGE, makeCtx())).toEqual({ status: 413, body: { error: "body too large" } })
  })
})
