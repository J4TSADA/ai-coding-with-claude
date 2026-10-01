# Spec: รายงานจุดน้ำท่วมจากคนในพื้นที่

> สถานะ: พร้อม implement (2026-09-30) ผ่านรีวิวรอบ 1 และเจ้าของฟีเจอร์ยืนยัน C-1 ถึง C-7 แล้ว
> ที่มา: [`docs/intent/flood-reports.md`](../intent/flood-reports.md)
> ข้อบังคับ: ทุกข้อใน skill `security-baseline` (`.claude/skills/security-baseline/SKILL.md`)
>
> การตัดสินใจเพิ่มจาก intent (เจ้าของฟีเจอร์ตอบ 2026-09-30)
> - จุดสังเกตที่ดูเหมือนบ้านเลขที่ ให้**ปฏิเสธด้วย pattern** (RPT-REQ-005)
> - รายงานซ้ำ ให้แสดง**ค่าล่าสุด** หน้าต่าง 1 ชม. และการหมดอายุ 6 ชม. นับจาก seenAt ล่าสุด (RPT-REQ-012, 013)
> - เบอร์โทร รับเฉพาะเบอร์ไทย 10 หลัก และ**ลบพร้อมการส่งที่หมดอายุ** รอบนี้ไม่ใช้เบอร์นับ rate limit (RPT-REQ-008, 017)
> - IP สำหรับ rate limit มาจาก **socket เท่านั้น** ไม่เชื่อ `X-Forwarded-For` (RPT-REQ-014)
>
> การตัดสินใจเพิ่มจากรีวิวรอบ 1 อยู่ในหัวข้อ [การตัดสินใจที่ยืนยันแล้ว](#การตัดสินใจที่ยืนยันแล้ว) ท้ายไฟล์

## คำศัพท์

| คำ | ความหมาย |
| --- | --- |
| **การส่งรายงาน** (submission) | คำขอ `POST` หนึ่งครั้งที่ผ่านการตรวจแล้ว เก็บไว้ภายใน มีเบอร์โทรได้ มี id ของตัวเอง ไม่ออก API สาธารณะ |
| **รายงาน** (report) | สิ่งที่แสดงต่อสาธารณะ รวมการส่งรายงานที่ซ้ำกันไว้เป็นรายการเดียว มี id ของตัวเอง แยกจาก id ของการส่ง |
| **จุดสังเกตที่แสดง** | ข้อความหลัง NFC → trim → ยุบช่องว่างซ้อนเป็นช่องเดียว |
| **key ของจุดสังเกต** | ใช้เทียบรายงานซ้ำ ดู RPT-REQ-012 |
| **ข้อความสำหรับตรวจ** | ใช้ตรวจ pattern ต้องห้าม ดู RPT-REQ-005 |
| **seenAt** | เวลาที่คนรายงานเห็นน้ำท่วม เก็บเป็น UTC แสดงเป็น +07:00 |
| **หมดอายุ** | `now - seenAt > 6 ชม.` (มากกว่าเท่านั้น ครบ 6 ชม. พอดียังไม่หมดอายุ) |
| **endpoint รายงาน** | path ที่ตรง `^/districts/[a-z-]+/reports$` |

ตัวอย่างใน acceptance criteria ใช้ `now = 2026-09-30T12:30:00Z` (19:30 เวลากรุงเทพฯ) เหมือน `tests/app.test.ts`

**กติกา test**: test ของฟีเจอร์นี้สร้าง `ctx` ผ่าน helper `makeCtx(overrides)` เสมอ helper นี้ใส่ `createReportStore()`, `createRateLimiter(...)` ตัวใหม่ และ `newId` แบบนับเลข (`"id-1"`, `"id-2"`, …) ทุกครั้ง ห้ามพึ่ง store ระดับ module

---

## Requirements

### RPT-REQ-001 ส่งรายงานได้ผ่าน `POST /districts/:id/reports`

ส่งรายงานที่ถูกต้องแล้วได้ `201` พร้อมรายงานที่ถูกบันทึก

- [ ] `handle("POST", "/districts/lat-phrao/reports", { landmark: "หน้าปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T19:00:00+07:00" }, ctx)` ได้ `status 201`
- [ ] body มี `notice: NOTICE`, `reportNotice: REPORT_NOTICE`, `merged: false` (**ชั้นบนสุด** ไม่อยู่ใน `report`) และ `report` ที่มี `id`, `districtId: "lat-phrao"`, `landmark: "หน้าปากซอยลาดพร้าว 71"`, `depthCm: 35`, `seenAt: "2026-09-30T19:00:00+07:00"`, `severity: { level: "unsafe-for-small-cars", labelTh: "รถเล็กไม่ควรผ่าน" }`, `confirmations: 1`, `source: "user-report"`, `disclaimer: REPORT_NOTICE`
- [ ] `report` มี key ตรงตามรายการข้างบนเท่านั้น (test ด้วย `Object.keys(...).sort()` เทียบรายการ)
- [ ] method อื่นที่ endpoint รายงาน (`GET`, `PUT`, `DELETE`) ได้ `404` `{ error: "not found" }` เหมือน route ที่ไม่รู้จักในปัจจุบัน และไม่นับ rate limit

### RPT-REQ-002 เขตต้องเป็นหนึ่งใน 12 เขตใน `src/districts.ts`

- [ ] `POST /districts/atlantis/reports` ที่ body ถูกต้องได้ `404` body `toEqual({ error: "unknown district", notice: NOTICE, reportNotice: REPORT_NOTICE })` และไม่มีอะไรถูกบันทึก
- [ ] `POST /districts/Lat-Phrao/reports` (ตัวใหญ่) ได้ `404` `{ error: "not found" }` (regex เดิม `[a-z-]+` ไม่ match จึงไม่ใช่ endpoint รายงาน)
- [ ] ทั้ง 12 id ใน `districts` ส่งรายงานได้ (test แบบวนทุกเขต ใช้ IP ต่างกันเพื่อไม่ชน rate limit)

### RPT-REQ-003 body ต้องเป็น JSON object ที่มีเฉพาะ field ที่รู้จัก

field ที่รับ: `landmark`, `depthCm`, `seenAt`, `phone` (ไม่บังคับ) เท่านั้น เขตมาจาก path ไม่รับ `districtId` ใน body ตรวจ field ด้วย `Object.keys(body)` (ไม่ใช้ `in` หรือ spread)

- [ ] body เป็น `undefined`, `null`, array, string หรือ number ได้ `400` และ `fields._body.code === "not-object"`
- [ ] body ที่มี field อื่น เช่น `severity`, `id`, `confirmations`, `districtId`, `merged` ได้ `400` และ `fields.<ชื่อ>.code === "unknown-field"`
- [ ] `JSON.parse('{"__proto__":{"x":1},"landmark":"…","depthCm":10,"seenAt":"…"}')` ได้ `400` `fields.__proto__.code === "unknown-field"`
- [ ] ขาด `landmark`, `depthCm` หรือ `seenAt` หรือส่งเป็น `null` ได้ `400` และ `fields.<ชื่อ>.code === "required"`
- [ ] ผิดหลาย field พร้อมกัน `fields` มีครบทุก field ที่ผิด (field ละหนึ่ง code ตัวแรกที่เจอตามลำดับในตาราง RPT-REQ-019)

### RPT-REQ-004 จุดสังเกตเป็นข้อความ 1–120 ตัวอักษร

ขั้นตอน: ต้องเป็น string → NFC → ปฏิเสธถ้ามีอักขระในหมวด `\p{C}` (control, format เช่น zero-width space U+200B/ZWJ/RTL override, surrogate, private use, unassigned) หรือ ` `/` ` → trim → ยุบ `\s+` เป็นช่องว่างเดียว → นับความยาว

ความยาวนับเป็น **grapheme** ด้วย `Intl.Segmenter("th", { granularity: "grapheme" })` บน**จุดสังเกตที่แสดง** (หลังยุบช่องว่างแล้ว) ให้ตรงกับที่คนเห็นว่าเป็น "ตัวอักษร"

- [ ] ไม่ใช่ string (เช่น `123`, `["a"]`) ได้ code `not-string`
- [ ] `""` และ `"   "` ได้ code `empty`
- [ ] 120 grapheme ผ่าน, 121 ได้ code `too-long`
- [ ] ข้อความไทยที่มีสระบนและวรรณยุกต์ 120 grapheme (เกิน 120 code point) ผ่าน เช่น `"ที่"` × 40
- [ ] นับหลังยุบช่องว่าง: `"ก".repeat(118) + "     " + "ข"` ผ่าน (ยุบแล้ว 120) ส่วน `"ก".repeat(119) + "  " + "ข"` ได้ `too-long` (ยุบแล้ว 121)
- [ ] มี `\n`, `\t`, `\u0000`, `​`, `‮` ได้ code `control-char` (ตรวจก่อน trim ดังนั้น `"\n"` นำหน้าก็ถูกปฏิเสธ)
- [ ] ค่าที่เก็บและแสดงคือจุดสังเกตที่แสดง (`"  หน้า   เซ็นทรัล "` แสดงเป็น `"หน้า เซ็นทรัล"`)

### RPT-REQ-005 ปฏิเสธจุดสังเกตที่มีที่อยู่ส่วนตัว ช่องทางติดต่อ หรือลิงก์

ตรวจบน**ข้อความสำหรับตรวจ** ซึ่งได้จากจุดสังเกตที่แสดง → NFKC (แปลง `／` เป็น `/` และตัวเลขเต็มความกว้างเป็นตัวเลขปกติ) → แปลงเลขไทย `๐-๙` เป็น `0-9` → ตัวพิมพ์เล็ก → ลบช่องว่างทั้งหมด

| code | pattern บนข้อความสำหรับตรวจ | ตัวอย่างที่ถูกปฏิเสธ |
| --- | --- | --- |
| `private-address` | มี `บ้านเลขที่` | `"บ้านเลขที่ 5 ซอยลาดพร้าว 71"` |
| `private-address` | `เลขที่\d` | `"เลขที่ 12"`, `"เลขที่๑๒"` |
| `private-address` | `\d+/\d+` | `"99/12 หมู่บ้านสุขใจ"`, `"99 / 12"`, `"๙๙/๑๒"`, `"99／12"` |
| `private-address` | `ห้อง\d` | `"คอนโด A ห้อง 1204"` |
| `private-address` | `หมู่(ที่)?\d` หรือ `(?<!ก)ม\.\d` | `"หมู่ที่ 5 บางเขน"`, `"99 ม.3"` |
| `contact-info` | ตัวเลขติดกัน 9 หลักขึ้นไป หลังลบ `-` และ `.` เพิ่ม | `"หน้าร้าน โทร 000 000 0000"`, `"0-0000-0000"` |
| `contact-info` | มี `@` | `"ติดต่อ @someone"` |
| `link` | มี `http`, `www.` หรือ `.com`, `.net`, `.org`, `.co`, `.th`, `.ly` ตามหลังตัวอักษรละติน | `"ดูที่ www.example.com"`, `"bit.ly/xyz"` |

- [ ] ตัวอย่างทุกแถวในตารางได้ `400` พร้อม code ตามตาราง
- [ ] `"หน้าปากซอยลาดพร้าว 71"`, `"ใต้สะพานข้ามแยก"`, `"หน้าเซ็นทรัลลาดพร้าว"`, `"ถนนพหลโยธิน กม. 12"`, `"ซอยรามคำแหง 24 แยก 7"` ผ่าน
- [ ] `"ซอยลาดพร้าว 71/1"` ถูกปฏิเสธ (false positive ที่ยอมรับ ดู EC-08)
- [ ] ข้อความใน `messageTh` ไม่ echo ข้อความที่ส่งมา

### RPT-REQ-006 ความลึกเป็นจำนวนเต็มหน่วยเซนติเมตร 0–300

- [ ] `0`, `1`, `299`, `300` ผ่าน
- [ ] `-1`, `301` ได้ code `out-of-range`
- [ ] `30.5`, `Infinity` (เช่นจาก `JSON.parse("1e400")`), `NaN` ได้ code `not-integer`
- [ ] `"30"`, `true` ได้ code `not-integer` (ไม่แปลง string เป็นตัวเลข)
- [ ] `-0` ผ่านและเก็บเป็น `0`
- [ ] ค่าที่ตอบกลับเป็น integer เสมอ

### RPT-REQ-007 เวลาที่เห็นต้องไม่อยู่ในอนาคตและไม่เก่ากว่า 6 ชั่วโมง

`seenAt` ต้องตรง regex นี้ทั้ง string (ห้ามใช้ `new Date(string)` ตัดสินว่าถูกรูปแบบหรือไม่)

```
^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$
```

แล้วตรวจค่าแต่ละส่วน: เดือน 01–12, วันมีจริงในเดือนนั้น (เทียบด้วย `Date.UTC` แล้วอ่านกลับ), ชั่วโมง 00–23, นาทีและวินาที 00–59, offset ชั่วโมง 00–14 นาที 00–59 เทียบกับ `ctx.now` เท่านั้น ไม่เรียก `new Date()` ใน logic

- [ ] `"2026-09-30T19:00:00+07:00"`, `"2026-09-30T12:00:00Z"`, `"2026-09-30T12:00:00.500Z"` ผ่าน และสองค่าแรกเก็บเป็นเวลาเดียวกัน
- [ ] `"2026-09-30T19:00:00"` (ไม่มี timezone), `"2026-09-30T19:00+07:00"` (ไม่มีวินาที), `"2026-09-30T12:00:00z"`, `"2026-09-30T19:00:00+0700"`, `"2026-09-30"`, `"เมื่อกี้"`, `""` ได้ code `invalid-format`
- [ ] `"2026-02-30T12:00:00Z"`, `"2026-09-30T24:00:00Z"`, `"2026-09-30T12:00:00+15:00"` ได้ code `invalid-format`
- [ ] number เช่น `1759233600000` ได้ code `not-string`
- [ ] เท่ากับ `now` พอดีผ่าน, `now + 1 มิลลิวินาที` ได้ code `in-future`
- [ ] `now - 6 ชม.` พอดีผ่าน, `now - 6 ชม. - 1 มิลลิวินาที` ได้ code `too-old`
- [ ] ค่าที่แสดงผ่าน `toBangkokIso()` เช่น `"2026-09-30T12:00:00Z"` แสดงเป็น `"2026-09-30T19:00:00+07:00"` (มิลลิวินาทีถูกตัดตอนแสดง แต่การเปรียบเทียบทุกจุดใช้ค่าเต็ม)

### RPT-REQ-008 เบอร์โทรไม่บังคับ รับเฉพาะเบอร์ไทย 10 หลัก

ไม่ส่ง, `null` หรือ `""` ถือว่าไม่มีเบอร์ ถ้าเป็น string ให้ลบ whitespace และ `-` แล้วต้องตรง `^0\d{9}$` เก็บเฉพาะรูปที่ normalize แล้ว

- [ ] ไม่ส่ง `phone`, `phone: null`, `phone: ""` ผ่าน และไม่มีเบอร์ถูกเก็บ
- [ ] `"0000000000"` และ `"000-000-0000"` ผ่าน (test ใช้เลขศูนย์ล้วนเท่านั้น ห้ามใช้เบอร์ที่อาจมีคนใช้จริง)
- [ ] `"000000000"` (9 หลัก), `"+66000000000"`, `"abc"`, `12345` (number), `"   "` ได้ code `invalid-phone`
- [ ] `messageTh` ของ `phone` ไม่มีค่าที่ส่งมา

### RPT-REQ-009 ระดับความรุนแรงคำนวณจากความลึก

client ส่งระดับความรุนแรงมาเองไม่ได้ (RPT-REQ-003)

| ความลึก (ซม.) | `level` | `labelTh` |
| --- | --- | --- |
| 0–9 | `wet` | ถนนเปียก |
| 10–29 | `hard-for-small-cars` | รถเล็กผ่านลำบาก |
| 30–49 | `unsafe-for-small-cars` | รถเล็กไม่ควรผ่าน |
| 50–300 | `dangerous` | อันตราย |

- [ ] ค่าขอบ `0, 9, 10, 29, 30, 49, 50, 300` ได้ level ตามตาราง (test แบบ table)
- [ ] เกณฑ์อยู่เป็นค่าคงที่ที่เดียวใน `src/reports.ts` (เกณฑ์ยังเป็น open question แก้ได้โดยไม่ต้องแก้ที่อื่น)

### RPT-REQ-010 รายงานขึ้นใน `GET /districts/:id` ทันที

เพิ่ม field `reportNotice` และ `reports` ใน response ส่วน field เดิม (`notice`, `district`, `stations`) คงรูปแบบเดิมทุกอย่าง

- [ ] หลัง `POST` สำเร็จ request `GET /districts/lat-phrao` ถัดไป (ใช้ `ctx` ชุดเดียวกัน) มีรายงานนั้นใน `reports` และ `reports[0]` เท่ากับ `report` ใน response ของ `POST`
- [ ] `reports` เรียงตาม `seenAt` ใหม่ไปเก่า ถ้าเท่ากันเรียงตาม `receivedAt` ล่าสุดของรายงานใหม่ไปเก่า ถ้ายังเท่ากันเรียงตาม `id` จากน้อยไปมาก
- [ ] เขตที่ไม่มีรายงานได้ `reports: []`
- [ ] รายงานของเขตอื่นไม่ปนมา
- [ ] test เดิมใน `tests/app.test.ts` ผ่านโดยไม่ต้องแก้

### RPT-REQ-011 ป้ายบอกว่าเป็นข้อมูลจากผู้ใช้ ไม่ใช่ประกาศทางการ

`REPORT_NOTICE = "ผู้ใช้รายงาน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"` export จาก `src/reports.ts`

กติกาเดียวทั้งฟีเจอร์: **ทุก response ที่ endpoint รายงานสร้าง** (201, 400, 404 unknown district, 413, 429) และ `GET /districts/:id` มี `notice: NOTICE` และ `reportNotice: REPORT_NOTICE` ส่วน response ที่ไม่เกี่ยวกับรายงาน (`404 not found` ทั่วไป, `400 invalid JSON` ของ path อื่น) คงรูปแบบเดิม

- [ ] response ของ endpoint รายงานทุก status ในรายการข้างบนมีทั้งสอง field (test แบบ table ต่อ status)
- [ ] ทุกรายการใน `reports` และ `report` ใน response ของ `POST` มี `source: "user-report"` และ `disclaimer: REPORT_NOTICE`

### RPT-REQ-012 รวมรายงานซ้ำ

**key ของจุดสังเกต** = จุดสังเกตที่แสดง → NFKC → แปลงเลขไทยเป็นเลขอารบิก → ตัวพิมพ์เล็ก

การส่งใหม่ถูกรวมเข้ากับรายงานที่**ยังไม่หมดอายุ**ที่มี**เขตเดียวกัน**, **key เท่ากัน** และ `|seenAt ใหม่ − seenAt ล่าสุดของรายงาน| ≤ 1 ชม.`

ถ้ามีรายงานเข้าเงื่อนไขมากกว่าหนึ่งรายการ เลือกตัวที่ `|Δ|` น้อยที่สุด ถ้าเท่ากันเลือกตัวที่ seenAt ล่าสุดใหม่กว่า ถ้ายังเท่ากันเลือกตัวที่สร้างก่อน

รายงานที่รวมแล้วแสดง `depthCm`, `seenAt`, `landmark` และ `severity` ของ**การส่งที่ seenAt ล่าสุด** (ถ้า seenAt เท่ากัน ตัวที่ `receivedAt` ใหม่กว่าชนะ) `confirmations` คือจำนวนการส่งที่ยังไม่หมดอายุในรายงานนั้น

- [ ] ส่ง `"หน้าปากซอยลาดพร้าว 71"` depth 20 seenAt 18:30 แล้วส่ง `"  หน้าปากซอยลาดพร้าว   ๗๑ "` depth 40 seenAt 19:00 (+07:00) ได้รายงานเดียว `confirmations: 2`, `depthCm: 40`, `seenAt: "…T19:00:00+07:00"`, `landmark: "หน้าปากซอยลาดพร้าว ๗๑"`
- [ ] response ของการส่งครั้งที่สองได้ `201`, `merged: true` และ `report.id` เดียวกับครั้งแรก
- [ ] `"Central Ladprao"` กับ `"central ladprao"` รวมกัน
- [ ] ต่างกัน 1 ชม. พอดีรวมกัน ต่างกัน 1 ชม. 1 มิลลิวินาทีได้รายงานแยก 2 รายการ
- [ ] จุดสังเกตเดียวกันแต่ต่างเขตไม่รวมกัน
- [ ] การส่งที่ seenAt เก่ากว่าค่าล่าสุดของรายงาน (แต่อยู่ในหน้าต่าง) เพิ่ม `confirmations` แต่ไม่เปลี่ยน `depthCm`/`seenAt`/`landmark` ที่แสดง
- [ ] มีรายงานสองรายการ key เดียวกัน seenAt ล่าสุด 17:30 และ 19:15 (+07:00) การส่ง seenAt 18:10 รวมเข้ารายการ 17:30 (Δ 40 นาที เทียบกับ 65 นาทีซึ่งเกินหน้าต่าง)
- [ ] มีรายงานสองรายการ key เดียวกัน seenAt ล่าสุด 17:30 และ 18:40 การส่ง seenAt 18:05 (Δ 35 นาทีเท่ากัน) รวมเข้ารายการ 18:40

### RPT-REQ-013 รายงานที่หมดอายุไม่แสดง

- [ ] ส่งรายงาน seenAt `12:00Z` แล้ว `GET` ที่ `now = 18:00Z` ยังเห็น ที่ `now = 18:00:00.001Z` ไม่เห็น
- [ ] รายงานที่รวมแล้ว หมดอายุตาม seenAt ล่าสุดของรายงานนั้น
- [ ] การส่งที่หมดอายุแล้วไม่ถูกนับใน `confirmations` (ส่ง 3 ครั้ง ครั้งแรกหมดอายุแล้ว เหลือ `confirmations: 2`)
- [ ] การส่งใหม่ไม่ถูกรวมเข้ากับรายงานที่หมดอายุแล้ว (ได้ `merged: false` และ `id` ใหม่)

### RPT-REQ-014 จำกัด 5 การส่งต่อ 10 นาทีต่อ IP

- IP มาจาก `ctx.ip` ซึ่ง `server.ts` ใส่จาก `req.socket.remoteAddress` เท่านั้น ไม่อ่าน `X-Forwarded-For` หรือ header อื่น
- key ของ limiter มาจาก `ipKey(ip)`:
  - `undefined` หรือ `""` → `"unknown"` (bucket ร่วม ปิดแบบปลอดภัย)
  - IPv4-mapped (`::ffff:1.2.3.4`) → `"1.2.3.4"`
  - IPv4 → ตามเดิม
  - IPv6 → ขยายเต็ม แล้วใช้ 4 กลุ่มแรก (prefix /64) เช่น `"2001:db8:1:2:aaaa::1"` → `"2001:0db8:0001:0002::/64"`
- นับทุก `POST` ที่ endpoint รายงาน รวมที่จะได้ 400 (ทั้ง validation และ invalid JSON), 404 unknown district และ 413 ตรวจ limit **ก่อน**ตรวจอย่างอื่นทั้งหมด
- หน้าต่างแบบ sliding: ครั้งที่ส่ง ณ `t` ยังนับอยู่ถ้า `now - t < 10 นาที` (ครบ 10 นาทีพอดีไม่นับแล้ว) ครั้งที่ถูกปฏิเสธด้วย 429 ไม่ถูกนับ
- `retryAfterSeconds = Math.ceil((t_เก่าสุดที่ยังนับ + 10 นาที − now) / 1000)` ค่าต่ำสุด 1

- [ ] IP เดียวกันส่ง 5 ครั้งที่ `now` ได้ `201` ทั้งหมด ครั้งที่ 6 ได้ `429` body `toEqual({ error: "too many reports", retryAfterSeconds: 600, notice: NOTICE, reportNotice: REPORT_NOTICE })` และไม่มีอะไรถูกบันทึก
- [ ] ครั้งที่ 6 ที่ `now + 10 นาที` พอดีได้ `201`, ที่ `now + 10 นาที − 1 มิลลิวินาที` ได้ `429` และ `retryAfterSeconds: 1`
- [ ] IP อื่นส่งได้ตามปกติขณะ IP แรกโดน 429
- [ ] ส่ง body ผิด 5 ครั้ง (400) ครั้งที่ 6 ที่ถูกต้องได้ `429`
- [ ] ส่ง `INVALID_JSON` หรือ `BODY_TOO_LARGE` 5 ครั้ง ครั้งที่ 6 ได้ `429`
- [ ] `"::ffff:10.0.0.1"` กับ `"10.0.0.1"` ใช้ bucket เดียวกัน, `"2001:db8:1:2:aaaa::1"` กับ `"2001:db8:1:2:bbbb::2"` ใช้ bucket เดียวกัน, `"2001:db8:1:3::1"` คนละ bucket
- [ ] ไม่มี `ctx.ip` 6 ครั้งติด ครั้งที่ 6 ได้ `429`
- [ ] เบอร์โทรไม่มีผลต่อการนับ (ส่งเบอร์ต่างกันจาก IP เดียวกันยังโดนที่ครั้งที่ 6)
- [ ] `src/` ไม่มีคำว่า `x-forwarded-for` (ตรวจด้วย test ที่ grep ไฟล์ใน `src/`)

### RPT-REQ-015 เบอร์โทรไม่ออกใน response ใดๆ

- [ ] ส่งรายงานที่มี `phone: "0000000000"` แล้ว `JSON.stringify` ของ response ทุกตัว (`POST` 201, `GET /districts`, `GET /districts/:id`, 400 ของ field อื่น, 429) ไม่มี `"0000000000"` และไม่มี key `phone` (จุดสังเกตใน test นี้ต้องไม่มีเลข 0 ติดกัน)
- [ ] type `PublicReport` ไม่มี field `phone` (ตรวจด้วย `tsc`)
- [ ] การแปลงเป็น `PublicReport` สร้าง object ใหม่ทีละ field ไม่ spread จาก `Submission` หรือ `ReportGroup` (ตรวจใน review)

### RPT-REQ-016 ไม่ลงข้อมูลส่วนบุคคลใน log ใช้ ID แทน

`handle()` ไม่เรียก `console.*` เอง แต่คืนบรรทัด log ที่ปลอดภัยใน `Response.log` แล้ว `server.ts` พิมพ์ด้วย `console.log(res.log)` เมื่อมีค่า

- [ ] `POST` ที่ได้ 201 คืน `log` ตรง regex `^report accepted submission=\S+ report=\S+ district=[a-z-]+ merged=(true|false)$` ใช้ `newId` แบบนับเลขแล้วได้ค่าที่ทำนายได้ เช่น `"report accepted submission=id-2 report=id-1 district=lat-phrao merged=false"`
- [ ] response อื่นทุกตัวไม่มี `log`
- [ ] `log` ไม่มี landmark, IP หรือเบอร์
- [ ] integration test (`tests/server.test.ts`) spy `console.log/info/warn/error` แล้วยิง request จริงทั้งแบบสำเร็จ แบบ 400 (phone ผิด), 413 และ invalid JSON ที่มี `"0000000000"` ใน body ไม่พบ `"0000000000"` ในข้อความ log ใดเลย
- [ ] `messageTh` ใน `fields` เป็นข้อความคงที่จากตาราง RPT-REQ-019 ไม่ echo ค่าที่ client ส่งมา
- [ ] (review และ grep) ไม่มี `console.*` ใน `src/` นอกจาก log ตอน listen และ `console.log(res.log)` ใน `server.ts`

### RPT-REQ-017 เบอร์โทรถูกลบเมื่อการส่งรายงานหมดอายุ

- `handle()` เรียก `store.purgeExpired(ctx.now)` และ `limiter.purge(ctx.now)` ทุกครั้งที่เข้า `GET /districts/:id` หรือ endpoint รายงาน
- `server.ts` เรียก purge ทั้งสองตัวทุก 60 วินาทีด้วย `setInterval(...).unref()` เพื่อลบข้อมูลแม้ไม่มี request เข้ามา เบอร์จึงอยู่ในหน่วยความจำไม่เกิน 6 ชม. + 60 วินาทีนับจาก seenAt
- เบอร์เก็บอยู่ใน `Submission` เท่านั้น ไม่มีสำเนาที่อื่น (ไม่มี index ตามเบอร์)

- [ ] ส่งพร้อมเบอร์ (submission id `"id-2"`) แล้วเรียก `GET` ที่เวลาหลังหมดอายุ `store.submissionIds()` (method สำหรับ test) ไม่มี `"id-2"`
- [ ] เรียก `store.purgeExpired(t)` ตรงๆ ได้ผลเดียวกัน
- [ ] `limiter.purge(now)` ลบบันทึกที่ `now - t ≥ 10 นาที` และลบ key ที่ว่างแล้วออกจาก Map

### RPT-REQ-018 จำกัดขนาด body และอ่าน UTF-8 ให้ถูก

`server.ts` เก็บ chunk เป็น `Buffer[]` นับ**จำนวน byte** ถ้าเกิน 10 240 byte หยุดอ่าน (`req.destroy()` หลังตอบ) ถ้าไม่เกิน `Buffer.concat(...).toString("utf8")` ครั้งเดียวแล้วค่อย `JSON.parse`

server ไม่ตอบ 400/413 เอง แต่ส่งค่าพิเศษเข้า `handle()` เพื่อให้ rate limit และ notice อยู่ที่เดียว

- `export const INVALID_JSON: unique symbol` และ `export const BODY_TOO_LARGE: unique symbol` จาก `src/app.ts`
- endpoint รายงาน: `INVALID_JSON` → `400 { error: "invalid JSON", notice, reportNotice }`, `BODY_TOO_LARGE` → `413 { error: "body too large", notice, reportNotice }`
- path อื่น: `INVALID_JSON` → `400 { error: "invalid JSON" }` (เหมือนเดิม), `BODY_TOO_LARGE` → `413 { error: "body too large" }`

- [ ] (unit) `handle("POST", "/districts/lat-phrao/reports", BODY_TOO_LARGE, ctx)` ได้ 413 และนับ rate limit
- [ ] (unit) `handle("GET", "/districts", INVALID_JSON, ctx)` ได้ `400 { error: "invalid JSON" }`
- [ ] (integration) body 10 240 byte ไม่ได้ 413, 10 241 byte ได้ 413
- [ ] (integration) จุดสังเกตภาษาไทยที่ถูกส่งเป็น chunk ละ 1 byte ถูกเก็บถูกต้องทุกตัวอักษร
- [ ] integration test เปิด server บน port 0 และยิงไปที่ `127.0.0.1` เท่านั้น

### RPT-REQ-019 รูปแบบ error ของ endpoint ใหม่

`400` body: `{ error: "invalid report", fields: { <field>: { code, messageTh } }, notice, reportNotice }` test ตรวจที่ `code` ส่วน `messageTh` ต้องตรงตารางนี้ทุกตัวอักษร

ลำดับการตรวจใน field เดียวกันเป็นไปตามลำดับแถว หยุดที่ code แรกที่เจอ

| field | code | messageTh |
| --- | --- | --- |
| `_body` | `not-object` | ข้อมูลที่ส่งมาต้องเป็น JSON object |
| ชื่อ field ที่ไม่รู้จัก | `unknown-field` | ไม่รู้จักข้อมูลช่องนี้ |
| ช่องที่บังคับ | `required` | ต้องกรอกช่องนี้ |
| `landmark`, `seenAt` | `not-string` | ต้องเป็นข้อความ |
| `landmark` | `control-char` | มีอักขระที่ใช้ไม่ได้ |
| `landmark` | `empty` | ต้องกรอกจุดสังเกต |
| `landmark` | `too-long` | จุดสังเกตยาวได้ไม่เกิน 120 ตัวอักษร |
| `landmark` | `private-address` | กรุณาระบุสถานที่สาธารณะ เช่น ปากซอย สะพาน หรือห้าง แทนบ้านเลขที่หรือที่อยู่ส่วนตัว |
| `landmark` | `contact-info` | ห้ามใส่เบอร์โทรหรือช่องทางติดต่อในจุดสังเกต |
| `landmark` | `link` | ห้ามใส่ลิงก์ในจุดสังเกต |
| `depthCm` | `not-integer` | ความลึกต้องเป็นจำนวนเต็มหน่วยเซนติเมตร |
| `depthCm` | `out-of-range` | ความลึกต้องอยู่ระหว่าง 0 ถึง 300 ซม. |
| `seenAt` | `invalid-format` | เวลาต้องอยู่ในรูปแบบ 2026-09-30T19:00:00+07:00 |
| `seenAt` | `in-future` | เวลาที่เห็นต้องไม่อยู่ในอนาคต |
| `seenAt` | `too-old` | รับเฉพาะน้ำท่วมที่เห็นภายใน 6 ชั่วโมง |
| `phone` | `invalid-phone` | เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0 |

ถ้าจุดสังเกตตรงหลาย pattern ใน RPT-REQ-005 ใช้ code ของแถวแรกที่ตรงตามลำดับในตาราง RPT-REQ-005

- [ ] ทุก code ในตารางมี test อย่างน้อยหนึ่งข้อ
- [ ] ไม่มี stack trace หรือข้อความ exception ใน response (ถ้า `handle()` throw ระหว่างทำงานกับรายงาน `server.ts` ตอบ `500 { error: "internal error" }` และ log แค่ `"internal error"` กับชื่อ path ไม่ log body)

### RPT-REQ-020 endpoint เดิมไม่เปลี่ยน

- [ ] `GET /districts` ได้ body เท่ากับก่อนแก้ทุก byte (snapshot test)
- [ ] `GET /districts/:id` มี `notice`, `district`, `stations` รูปแบบเดิม เพิ่มแค่ `reportNotice` และ `reports`
- [ ] `NOTICE` ใน `src/app.ts` ไม่ถูกแก้
- [ ] `npm test` และ `npm run lint` ผ่าน
- [ ] ไม่มี runtime dependency ใหม่ใน `package.json` และไม่มี `flood-api.rooptanjai.com` ในโค้ดหรือ test

### RPT-REQ-021 IP ไม่ออก response และไม่ลง log

IP ถือเป็นข้อมูลที่ระบุตัวคนได้ ใช้ได้แค่เป็น key ของ limiter ในหน่วยความจำ

- [ ] ไม่มี IP ใน response ใดๆ (test ส่งด้วย `ip: "203.0.113.7"` แล้ว `JSON.stringify` ของทุก response ไม่มี `"203.0.113.7"`)
- [ ] ไม่มี IP ใน `Response.log` และใน `Submission` หรือ `ReportGroup`
- [ ] key ของ limiter ถูกลบภายใน 10 นาทีหลังครั้งสุดท้ายที่ส่ง + รอบ purge (RPT-REQ-017)

---

## Design

### Data model (`src/reports.ts`)

```ts
export const REPORT_NOTICE = "ผู้ใช้รายงาน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"

export type SeverityLevel = "wet" | "hard-for-small-cars" | "unsafe-for-small-cars" | "dangerous"
export type Severity = { level: SeverityLevel; labelTh: string }

/** Passed validation. Values are already normalized. */
export type ValidReportInput = {
  landmark: string      // display form: NFC, trimmed, whitespace collapsed
  depthCm: number       // integer 0–300, -0 stored as 0
  seenAt: Date          // UTC
  phone?: string        // "0XXXXXXXXX"
}

export type FieldError = { code: string; messageTh: string }

/** One accepted POST. Internal only: holds personal data. */
type Submission = {
  id: string
  depthCm: number
  seenAt: Date
  receivedAt: Date      // ctx.now at submit; tie-breaker for "latest"
  landmark: string
  phone?: string        // only copy of the phone anywhere in the app
}

/** Duplicates grouped together. Internal only. */
type ReportGroup = {
  id: string            // public report id, own newId(), not a submission id
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
  seenAt: string        // +07:00 via toBangkokIso
  severity: Severity
  confirmations: number
  source: "user-report"
  disclaimer: typeof REPORT_NOTICE
}

export type SubmitResult = { report: PublicReport; merged: boolean; submissionId: string }

export type ReportStore = {
  submit(districtId: string, input: ValidReportInput, now: Date, newId: () => string): SubmitResult
  listByDistrict(districtId: string, now: Date): PublicReport[]
  purgeExpired(now: Date): void
  /** For tests only. */
  submissionIds(): string[]
}

export function createReportStore(): ReportStore
export function validateReport(body: unknown, now: Date):
  | { ok: true; value: ValidReportInput }
  | { ok: false; fields: Record<string, FieldError> }
export function severityOf(depthCm: number): Severity
export function displayLandmark(raw: string): string
export function landmarkKey(display: string): string
export function checkText(display: string): string   // form used for RPT-REQ-005 patterns
```

ลำดับการสร้าง id: รายงานใหม่เรียก `newId()` ให้ `ReportGroup` ก่อน แล้วจึงเรียกให้ `Submission` ส่วนการรวมเข้ารายงานเดิมเรียกครั้งเดียวให้ `Submission`

### Rate limit (`src/rate-limit.ts`)

```ts
export type RateLimiter = {
  /** Records the attempt if allowed. */
  hit(key: string, now: Date): { allowed: true } | { allowed: false; retryAfterSeconds: number }
  purge(now: Date): void
}
export function createRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter
export function ipKey(ip: string | undefined): string
export const REPORT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 }
```

เก็บ `Map<key, Date[]>` ในหน่วยความจำเท่านั้น ใช้ `node:net` `isIPv4`/`isIPv6` ใน `ipKey` (ไม่มี dependency เพิ่ม)

### API

**ใหม่ `POST /districts/:id/reports`**

Request
```json
{ "landmark": "หน้าปากซอยลาดพร้าว 71", "depthCm": 35, "seenAt": "2026-09-30T19:00:00+07:00", "phone": "000-000-0000" }
```

Response `201`
```json
{
  "notice": "ตัวอย่างเพื่อการเรียนเท่านั้น …",
  "reportNotice": "ผู้ใช้รายงาน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ",
  "merged": false,
  "report": {
    "id": "…", "districtId": "lat-phrao", "landmark": "หน้าปากซอยลาดพร้าว 71",
    "depthCm": 35, "seenAt": "2026-09-30T19:00:00+07:00",
    "severity": { "level": "unsafe-for-small-cars", "labelTh": "รถเล็กไม่ควรผ่าน" },
    "confirmations": 1, "source": "user-report",
    "disclaimer": "ผู้ใช้รายงาน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"
  }
}
```

Error ของ endpoint นี้: `400` invalid report / invalid JSON, `404` unknown district, `413` body too large, `429` too many reports ทุกตัวมี `notice` และ `reportNotice`

ลำดับใน handler ของ `POST` endpoint รายงาน:
1. purge store และ limiter
2. `limiter.hit(ipKey(ctx.ip))` ถ้าไม่ผ่าน → 429
3. body เป็น `BODY_TOO_LARGE` → 413, เป็น `INVALID_JSON` → 400
4. ตรวจเขต → 404
5. `validateReport` → 400
6. `store.submit` → 201 พร้อม `log`

**เปลี่ยน `GET /districts/:id`** เพิ่ม field เท่านั้น
```json
{ "notice": "…", "district": { … }, "stations": [ … ], "reportNotice": "…", "reports": [ PublicReport, … ] }
```

**`GET /districts`** ไม่เปลี่ยน

### `Context`, `Response` และ `handle()` (`src/app.ts`)

```ts
export type Response = { status: number; body: unknown; log?: string }

export type Context = {
  now: Date
  ip?: string               // from socket only
  reports?: ReportStore     // default: module-level store (server uses this)
  limiter?: RateLimiter     // default: module-level limiter
  newId?: () => string      // default: crypto.randomUUID
}

export const INVALID_JSON: unique symbol
export const BODY_TOO_LARGE: unique symbol
```

`handle()` ยังไม่ผูกกับ `node:http` และไม่เรียก `console.*` ค่า default ระดับ module มีไว้ให้ `server.ts` และ test เดิมที่ไม่ส่ง ctx ครบ test ใหม่ต้องใช้ `makeCtx()` เสมอ (ดูกติกา test ด้านบน)

### ไฟล์ที่ต้องแก้

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/reports.ts` (ใหม่) | types, `validateReport`, `displayLandmark`, `landmarkKey`, `checkText`, pattern ต้องห้าม, ตาราง error, `severityOf`, `createReportStore`, `REPORT_NOTICE` |
| `src/rate-limit.ts` (ใหม่) | `createRateLimiter`, `ipKey`, `REPORT_RATE_LIMIT` |
| `src/app.ts` | ขยาย `Context` และ `Response`, `INVALID_JSON`/`BODY_TOO_LARGE`, route `POST /districts/:id/reports`, เพิ่ม `reportNotice`/`reports` ใน `GET /districts/:id` |
| `src/server.ts` | อ่าน body เป็น `Buffer[]` จำกัด 10 240 byte, ส่ง sentinel เข้า `handle()` แทนตอบเอง, `ip: req.socket.remoteAddress`, พิมพ์ `res.log`, purge ทุก 60 วินาที (`unref`), จับ exception → 500 |
| `tests/helpers.ts` (ใหม่) | `makeCtx(overrides)` |
| `tests/reports.test.ts` (ใหม่) | RPT-REQ-001 ถึง 013, 015, 017, 019, 021 |
| `tests/rate-limit.test.ts` (ใหม่) | RPT-REQ-014 และ `ipKey` |
| `tests/server.test.ts` (ใหม่) | RPT-REQ-016 (log), 018 (ขนาดและ UTF-8) บน `127.0.0.1` port 0 และ grep `src/` หา `x-forwarded-for` |
| `tests/app.test.ts` | ไม่แก้ test เดิม (ยืนยัน RPT-REQ-020) เพิ่ม snapshot ของ `GET /districts` ได้ |
| `README.md` | เพิ่มแถว `src/reports.ts`, `src/rate-limit.ts` ในตาราง และตัวอย่าง `curl -X POST` ไปที่ `localhost` |

ไม่แตะ `data/stations.json`, `src/stations.ts`, `src/districts.ts`, `src/time.ts` และ `NOTICE`

---

## Edge cases

| # | กรณี | พฤติกรรมที่ต้องการ |
| --- | --- | --- |
| EC-01 | seenAt ครบ 6 ชม. พอดี / ตรงกับ `now` พอดี | รับ (ขอบเป็นแบบรวม) และยังแสดงจนกว่าจะเกิน 6 ชม. |
| EC-02 | seenAt ไม่มี timezone เช่น `"2026-09-30T19:00:00"` | ปฏิเสธ `invalid-format` เพราะตีความได้ทั้ง UTC และเวลาไทย ต่างกัน 7 ชม. |
| EC-03 | คนแรกบอก 20 ซม. คนที่สองบอก 60 ซม. จุดเดียวกัน | รวมเป็นรายการเดียว แสดงค่าของ seenAt ล่าสุด ไม่เฉลี่ย |
| EC-04 | คนเดิม (IP เดิม) ส่งจุดเดียวกันซ้ำ 5 ครั้ง | `confirmations` เป็น 5 เพราะรอบนี้ไม่เก็บตัวตนคนส่ง rate limit จำกัดไว้ ดู Out of scope |
| EC-05 | รายงานถูกยืนยันต่อเนื่องทุก 50 นาที | รายการเดิมไม่หมดอายุเพราะนับจาก seenAt ล่าสุด แต่การส่งเก่าแต่ละครั้ง (และเบอร์) หมดอายุและถูกลบเป็นรายครั้ง |
| EC-06 | คนส่งมาช้า seenAt เก่ากว่าค่าที่แสดงอยู่ | เพิ่ม `confirmations` ไม่ทับค่าล่าสุด |
| EC-07 | ผู้ใช้หลายคนอยู่หลัง CGNAT IP เดียวกัน | คนที่ 6 ภายใน 10 นาทีโดน 429 ยอมรับในรอบนี้ (intent ให้นับตาม IP เสมอ) |
| EC-08 | ชื่อซอยจริงที่มี `/` เช่น `"ซอยลาดพร้าว 71/1"` | ปฏิเสธ `private-address` (false positive) ข้อความแนะนำให้เขียนแบบอื่น เช่น `"ปากซอยลาดพร้าว 71 แยก 1"` |
| EC-09 | client ส่ง `severity`, `confirmations`, `id`, `districtId`, `__proto__` มาเอง | 400 `unknown-field` |
| EC-10 | `depthCm` เป็น `"30"`, `30.0` หรือ `-0` | `"30"` ถูกปฏิเสธ `30.0` ใน JSON parse ได้ `30` จึงรับ `-0` รับและเก็บเป็น `0` |
| EC-11 | จุดสังเกตต่างกันแค่ช่องว่าง ตัวใหญ่เล็ก หรือเลขไทยกับเลขอารบิก | ถือเป็นจุดเดียวกัน แต่สะกดต่างกัน (`"ลาดพร้าว71"` กับ `"ลาดพร้าว 71"`) ถือเป็นคนละจุด |
| EC-12 | เบอร์ผิดรูปแบบมาพร้อมข้อมูลอื่นที่ถูก | ปฏิเสธทั้งรายงาน ไม่เก็บ ข้อความ error ไม่มีเบอร์ |
| EC-13 | ไม่มี `ctx.ip` | นับใน bucket `"unknown"` ร่วมกัน ไม่ข้าม rate limit |
| EC-14 | server restart | รายงานและ rate limit หายทั้งหมด ยอมรับตาม intent |
| EC-15 | body ใหญ่เกิน 10 240 byte | 413 ไม่ parse และนับ rate limit |
| EC-16 | ใส่ zero-width space หรือ RTL override ในจุดสังเกต | ปฏิเสธ `control-char` กันการเลี่ยง pattern และการรวมรายงานซ้ำ |
| EC-17 | เขียนที่อยู่ด้วยเลขไทย เลขเต็มความกว้าง หรือเว้นวรรครอบ `/` | ถูกจับด้วยข้อความสำหรับตรวจ (`"๙๙ / ๑๒"` → `99/12`) |
| EC-18 | จุดสังเกตมีเบอร์โทรหรือลิงก์ | ปฏิเสธ `contact-info` หรือ `link` ไม่ขึ้น API สาธารณะ |
| EC-19 | `"ถนนพหลโยธิน กม. 12"` | ผ่าน (`(?<!ก)ม\.\d` ไม่จับ `กม.`) |
| EC-20 | ผู้ใช้ IPv6 เปลี่ยน address ภายใน /64 เดียวกัน | นับเป็น bucket เดียวกัน เลี่ยง rate limit ไม่ได้ |
| EC-21 | Thai text ถูกตัดคร่อม chunk ของ HTTP | อ่านถูกต้องเพราะ decode หลังรวม Buffer |
| EC-22 | ไม่มี request เข้ามาหลายชั่วโมง | timer purge ทุก 60 วินาทีลบการส่งที่หมดอายุ (และเบอร์) อยู่ดี |

---

## Out of scope (รอบนี้ไม่ทำ)

- เก็บข้อมูลถาวร (ไฟล์, SQLite, DB) ใช้ in-memory เท่านั้น
- พิกัด GPS, รูปภาพ, แผนที่
- บัญชีผู้ใช้, login, การยืนยันเบอร์ด้วย OTP, การติดต่อกลับคนรายงาน
- ใช้เบอร์โทรเป็นเงื่อนไขเสริมของ rate limit
- นับ `confirmations` แบบไม่ซ้ำคน (ต้องเก็บตัวตนหรือ hash ของ IP ซึ่งเป็นเรื่อง PDPA)
- ตรวจจับชื่อคนในจุดสังเกต (ทำด้วย pattern ไม่ได้อย่างน่าเชื่อถือ) และคำหยาบหรือสแปมเชิงเนื้อหา
- CAPTCHA หรือกลไกกันสแปมอื่นนอกจาก rate limit ต่อ IP
- รองรับ proxy / `X-Forwarded-For`
- คนตรวจรายงานก่อนเผยแพร่, การลบหรือแก้รายงานโดยผู้ใช้หรือแอดมิน, การรายงานว่ารายงานไหนผิด
- ข้อความขอความยินยอมเก็บเบอร์ (PDPA) และนโยบายเก็บเบอร์ระยะยาว
- ปรับเกณฑ์ความรุนแรงหรือเวลาหมดอายุตามความลึก
- endpoint แสดงรายงานแยก (`GET /districts/:id/reports`) หรือจำนวนรายงานใน `GET /districts`
- pagination ของ `reports`
- header `Retry-After` (บอกผ่าน `retryAfterSeconds` ใน body แทน เพราะ `Response` ยังไม่มี header)
- ดึงหรือส่งข้อมูลกับ Flood Watch จริง (`flood-api.rooptanjai.com`) ทุกรูปแบบ
- ขยายเป็น 50 เขต
- หน้าเว็บ/ฟอร์ม (รอบนี้มีแค่ API) ทั้งนี้ client ที่แสดง `landmark` ต้อง escape เป็นข้อความเสมอ

---

## การตัดสินใจที่ยืนยันแล้ว

เจ้าของฟีเจอร์ยืนยันทุกข้อเมื่อ 2026-09-30 ถ้าจะเปลี่ยนภายหลังให้แก้ requirement ที่อ้างถึงพร้อมกัน

| # | เรื่อง | ข้อตกลง | ผลที่ยอมรับ |
| --- | --- | --- | --- |
| C-1 | rate limit นับอะไร (RPT-REQ-014) | นับทุก `POST` ที่ endpoint รายงาน รวมที่ได้ 400/404/413 | เข้มกว่าคำว่า "5 รายงาน" ใน intent คนพิมพ์ผิดหลายครั้งจะโดนบล็อก แลกกับการกันยิงลองค่า |
| C-2 | การเก็บเบอร์ (RPT-REQ-008, 017) | รับและเก็บตาม Q2 ของ intent รอบนี้ยังไม่มีฟีเจอร์ใช้เบอร์ ลบเมื่อการส่งหมดอายุ | ระยะเก็บระยะยาวและข้อความขอความยินยอมยังเป็น open question ของผู้รับผิดชอบ PDPA ใน intent ต้องได้คำตอบก่อนเก็บข้อมูลถาวร |
| C-3 | `NOTICE` เดิมที่บอกว่า "ข้อมูลเป็นข้อมูลสมมติ" | ไม่แก้ `NOTICE` ใช้ `reportNotice` แยกสำหรับรายงาน | ข้อความสองอันแสดงคู่กันในรอบนี้ |
| C-4 | ความลึก 0 ซม. (RPT-REQ-009) | แสดงเป็น "ถนนเปียก" ตามตารางใน intent | ยังไม่มีระดับ "ไม่มีน้ำ" |
| C-5 | นับความยาวจุดสังเกต (RPT-REQ-004) | นับเป็น grapheme (ตามที่คนเห็น) ไม่เกิน 120 | ข้อความไทยยาวเป็น code point ได้มากกว่า 120 |
| C-6 | pattern ต้องห้าม (RPT-REQ-005) | ตามตารางใน RPT-REQ-005 | false positive เช่น `"ซอย 71/1"` และชื่อคนในจุดสังเกตยังหลุดได้ |
| C-7 | นับ IPv6 (RPT-REQ-014) | นับรวมทั้ง prefix /64 | ถ้าผู้ให้บริการแจก /64 เดียวให้หลายบ้าน จะโดนบล็อกรวมกันแบบ CGNAT |
