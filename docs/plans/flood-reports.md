# แผน: รายงานจุดน้ำท่วม (tracer bullet)

> spec: [`docs/specs/flood-reports.md`](../specs/flood-reports.md) (RPT-REQ-001 ถึง 021)
> สถานะ: ตกลงแผนแล้ว 2026-09-30 ยังไม่เริ่มเขียนโค้ด

เส้นทาง tracer: `handle()` (API) → `src/reports.ts` (logic) → `ReportStore` (DB) → test
"DB" คือ store ในหน่วยความจำเท่านั้น เพราะ CLAUDE.md และ spec ห้ามเก็บลงไฟล์หรือ DB จริง

**กติกาทุกขั้น**
- เขียน test ให้แดงก่อน แล้วค่อยเขียนโค้ดให้เขียว
- สร้าง `ctx` ด้วย `makeCtx()` เสมอ
- ใช้ `ctx.now` ไม่เรียก `new Date()` ใน logic
- ความลึกเป็นจำนวนเต็มหน่วยเซนติเมตร
- import ใส่นามสกุล `.ts`
- ไม่เรียก `console.*` ใน `handle()`
- จบแต่ละขั้นต้องผ่าน `npm test` และ `npm run lint`
- ไม่แตะ `src/time.ts`, `src/districts.ts`, `src/stations.ts`, `data/stations.json` และ `NOTICE`

---

## คืนนี้ (8 ขั้น)

### - [ ] 1. POST ตอบ 201 (tracer ครึ่งแรก)

ยังเชื่อ body ที่ส่งมาตรงๆ ไปก่อน การตรวจจริงเริ่มขั้น 4

- [ ] ไฟล์: สร้าง `src/reports.ts` มี `REPORT_NOTICE`, types, `severityOf`, `createReportStore` (ยังไม่รวมรายงานซ้ำ) และ `toPublic` (สร้าง object ใหม่ทีละ field ห้าม spread)
- [ ] ไฟล์: สร้าง `tests/helpers.ts` มี `makeCtx(overrides)` ที่ได้ store ใหม่ทุกครั้งและ `newId` นับเลข `id-1`, `id-2`, …
- [ ] ไฟล์: แก้ `src/app.ts` ขยาย `Context` (`ip`, `reports`, `newId`) และ `Response` (`log?`) แล้วเพิ่ม route `POST ^/districts/([a-z-]+)/reports$`
- [ ] test RPT-REQ-001: body ตัวอย่างได้ 201, `notice`, `reportNotice` และ `merged: false` อยู่ชั้นบนสุด
- [ ] test RPT-REQ-001: `Object.keys(report).sort()` ตรงรายการ
- [ ] test RPT-REQ-009: table test ที่ขอบ `0, 9, 10, 29, 30, 49, 50, 300`
- [ ] test RPT-REQ-011: `report.source === "user-report"` และ `disclaimer === REPORT_NOTICE`
- [ ] ลำดับ id: รายงานได้ `newId()` ก่อน แล้วจึงถึงการส่ง (รายงานเป็น `id-1` การส่งเป็น `id-2`)

### - [ ] 2. GET แสดงรายงาน (tracer ครบทุกชั้น)

- [ ] ไฟล์: `src/app.ts` เพิ่ม `reportNotice` และ `reports` ใน `GET /districts/:id`
- [ ] ไฟล์: `src/reports.ts` เรียงตาม seenAt ใหม่ไปเก่า แล้ว receivedAt ใหม่ไปเก่า แล้ว id น้อยไปมาก
- [ ] ไฟล์: `tests/app.test.ts` เพิ่ม snapshot อย่างเดียว ไม่แก้ test เดิม
- [ ] test RPT-REQ-010: หลัง POST แล้ว `reports[0]` เท่ากับ `report` ที่ POST ตอบมา
- [ ] test RPT-REQ-010: เขตที่ไม่มีรายงานได้ `[]` และรายงานของเขตอื่นไม่ปนมา
- [ ] test RPT-REQ-010: ลำดับการเรียงถูกต้อง
- [ ] test RPT-REQ-011: `GET /districts/:id` มี `reportNotice`
- [ ] test RPT-REQ-020: snapshot ของ `GET /districts` ไม่เปลี่ยน และ test เดิมผ่านโดยไม่ต้องแก้

### - [ ] 3. route และเขต

- [ ] ไฟล์: `src/app.ts`, `tests/reports.test.ts`
- [ ] test RPT-REQ-001: `GET`, `PUT` และ `DELETE` ที่ endpoint รายงานได้ `404 { error: "not found" }`
- [ ] test RPT-REQ-002: `atlantis` ได้ 404 `{ error: "unknown district", notice, reportNotice }` และไม่มีอะไรถูกบันทึก
- [ ] test RPT-REQ-002: `Lat-Phrao` (ตัวใหญ่) ได้ `{ error: "not found" }`
- [ ] test RPT-REQ-002: ส่งได้ครบทั้ง 12 เขต โดยใช้ `ip` ไม่ซ้ำกัน

### - [ ] 4. รูปร่าง body และรูปแบบ error

- [ ] ไฟล์: `src/reports.ts` เพิ่ม `validateReport` และเก็บตาราง `messageTh` ไว้ที่เดียว
- [ ] ไฟล์: `src/app.ts` ตอบ 400 `invalid report`
- [ ] test RPT-REQ-003: body เป็น `undefined`, `null`, array, string หรือ number ได้ `_body.not-object`
- [ ] test RPT-REQ-003: field ที่ไม่รู้จัก (รวม `__proto__`) ได้ `unknown-field` โดยตรวจด้วย `Object.keys`
- [ ] test RPT-REQ-003: field หายหรือเป็น `null` ได้ `required` และถ้าผิดหลาย field ต้องได้ครบทุก field
- [ ] test RPT-REQ-019: `messageTh` ตรงตารางทุกตัวอักษร และ 400 มี `notice` กับ `reportNotice`

### - [ ] 5. ความลึกและเวลาที่เห็น

- [ ] ไฟล์: `src/reports.ts`, `tests/reports.test.ts`
- [ ] test RPT-REQ-006: `0, 1, 299, 300` ผ่าน และ `-1, 301` ได้ `out-of-range`
- [ ] test RPT-REQ-006: `30.5, Infinity, NaN, "30", true` ได้ `not-integer`
- [ ] test RPT-REQ-006: `-0` เก็บเป็น `0` (เช็กด้วย `Object.is`)
- [ ] test RPT-REQ-007: ตรวจด้วย regex เต็มตาม spec บวกตรวจช่วงค่า และทุกตัวอย่างในข้อนี้ได้ `invalid-format`
- [ ] test RPT-REQ-007: ส่งเป็น number ได้ `not-string`
- [ ] test RPT-REQ-007: ขอบ `now` / `now + 1ms` และ `now - 6h` / `now - 6h - 1ms`
- [ ] test RPT-REQ-007: `12:00:00Z` กับ `19:00:00+07:00` เก็บเป็นเวลาเดียวกัน

### - [ ] 6. ข้อความจุดสังเกต (ยังไม่ทำ pattern ต้องห้าม)

- [ ] ไฟล์: `src/reports.ts` เพิ่ม `displayLandmark`
- [ ] test RPT-REQ-004: ไม่ใช่ string ได้ `not-string` และค่าว่างได้ `empty`
- [ ] test RPT-REQ-004: 120 grapheme ผ่าน 121 ไม่ผ่าน, `"ที่"×40` ผ่าน, นับความยาวหลังยุบช่องว่าง
- [ ] test RPT-REQ-004: `\n`, `\t`, `\u0000`, U+200B และ U+202E ได้ `control-char` (ตรวจก่อน trim)
- [ ] test RPT-REQ-004: `"  หน้า   เซ็นทรัล "` ถูกเก็บเป็น `"หน้า เซ็นทรัล"`

### - [ ] 7. เบอร์โทรและความเป็นส่วนตัว

- [ ] ไฟล์: `src/reports.ts` ตรวจเบอร์ และเก็บเบอร์ไว้ใน `Submission` ที่เดียว
- [ ] test RPT-REQ-008: ไม่ส่งเบอร์, `null`, `""`, `"0000000000"` และ `"000-000-0000"` ผ่าน
- [ ] test RPT-REQ-008: 9 หลัก, `+66…`, `"abc"`, `12345` และ `"   "` ได้ `invalid-phone` โดย `messageTh` ไม่มีค่าที่ส่งมา
- [ ] test RPT-REQ-015: response ทุกตัวไม่มี `"0000000000"` และไม่มี key `phone`
- [ ] test RPT-REQ-015: type `PublicReport` ไม่มี `phone` (ตรวจด้วย `tsc`)
- [ ] test RPT-REQ-021: ส่งด้วย `ip: "203.0.113.7"` แล้วไม่มี IP นี้ใน response ใดเลย

### - [ ] 8. rate limit 5 ครั้งต่อ 10 นาทีต่อ IP

- [ ] ไฟล์: สร้าง `src/rate-limit.ts` มี `createRateLimiter`, `ipKey` (IPv4, `::ffff:` และ `unknown`) และ `REPORT_RATE_LIMIT`
- [ ] ไฟล์: สร้าง `tests/rate-limit.test.ts`
- [ ] ไฟล์: แก้ `src/app.ts` ให้เรียก `hit()` ก่อนตรวจอย่างอื่นทั้งหมด
- [ ] ไฟล์: แก้ `tests/helpers.ts` ให้ได้ limiter ใหม่ทุกครั้ง
- [ ] ไฟล์: แก้ `src/server.ts` ส่ง `ip: req.socket.remoteAddress`
- [ ] test RPT-REQ-014: ครั้งที่ 6 ได้ 429 `retryAfterSeconds: 600` และไม่มีอะไรถูกบันทึก
- [ ] test RPT-REQ-014: ที่ `now + 10 นาที` พอดีได้ 201 และที่ `now + 10 นาที - 1ms` ได้ 429 `retryAfterSeconds: 1`
- [ ] test RPT-REQ-014: IP อื่นยังส่งได้ และการส่งที่ได้ 400 ถูกนับด้วย
- [ ] test RPT-REQ-014: `::ffff:10.0.0.1` กับ `10.0.0.1` ใช้ bucket เดียวกัน, ไม่มี ip ก็ได้ 429 ที่ครั้งที่ 6, ส่งเบอร์ต่างกันก็ไม่ช่วย
- [ ] test RPT-REQ-014: grep แล้ว `src/` ต้องไม่มี `x-forwarded-for`
- [ ] test RPT-REQ-017: `limiter.purge(now)` ลบ key ที่ว่างออก

---

## Later

- [ ] RPT-REQ-005: pattern ต้องห้าม (บ้านเลขที่ เบอร์ ลิงก์) ได้แก่ `checkText`, NFKC และการแปลงเลขไทย
- [ ] RPT-REQ-012: รวมรายงานซ้ำ ได้แก่ `landmarkKey`, หน้าต่าง 1 ชม. และ `merged: true`
- [ ] RPT-REQ-013 / 017: การหมดอายุ, `purgeExpired`, `submissionIds()` และ timer purge ทุก 60 วินาทีที่เรียก `.unref()`
- [ ] RPT-REQ-016: `Response.log` และ `console.log(res.log)` ใน server
- [ ] RPT-REQ-018: `INVALID_JSON` / `BODY_TOO_LARGE`, จำกัด body 10 240 byte และอ่าน UTF-8 ข้าม chunk
- [ ] RPT-REQ-014 ที่เหลือ: IPv6 /64 และนับ sentinel ใน rate limit
- [ ] RPT-REQ-019: server ตอบ 500 `internal error`
- [ ] `tests/server.test.ts`: log spy และขนาด body บน `127.0.0.1` port 0
- [ ] RPT-REQ-021 ส่วน log
- [ ] README: เพิ่มแถวไฟล์ใหม่และตัวอย่าง `curl` ไปที่ `localhost`
- [ ] RPT-REQ-020: ไม่มี dependency ใหม่ และไม่มี hostname ของ Flood Watch จริง

---

## ความเสี่ยง

- **ช่องว่างข้อมูลส่วนตัว**: จบคืนนี้แล้วยังไม่มี RPT-REQ-005 (จุดสังเกตใส่บ้านเลขที่หรือเบอร์ได้) และ RPT-REQ-017 (เบอร์ยังไม่ถูกลบ) ห้ามเปิดให้คนจริงใช้จนกว่าจะทำสองข้อนี้
- **rate limit ย้อนมากระทบ test เก่า**: ขั้น 8 ทำให้ test ที่ส่งเกิน 5 ครั้งใน ctx เดียวพัง จึงให้ test ที่วนหลายครั้งใช้ `ip` ไม่ซ้ำกันตั้งแต่ขั้น 3
- **store ระดับ module**: default store ระดับ module มีไว้ให้ server ใช้ ถ้า test ไหนลืมใช้ `makeCtx()` state จะรั่วข้าม test
- **`-0`**: `toBe(0)` แยก `-0` ออกจาก `0` จึงต้อง normalize ก่อนเก็บ
- **Unicode**: `\p{C}` ต้องใช้ flag `u` และ `Intl.Segmenter` ต้องใช้ Node ที่มี full ICU
- **ยังไม่ได้ติดตั้ง dependencies**: repo ยังไม่มี `node_modules` ต้องรัน `npm ci` ก่อนจะรัน test ได้ (ขออนุญาตก่อนรัน)

## เรื่องที่ยังไม่แน่ใจ

- [ ] **404 ของ GET**: `GET /districts/atlantis` ตอนได้ 404 ต้องมี `notice` และ `reportNotice` ไหม (RPT-REQ-011 ไม่ได้บอกชัด) แผนนี้คงรูปแบบเดิมไว้ไปก่อน
- [ ] **ก่อนมีการรวมรายงานซ้ำ**: ขั้น 1–7 ยังไม่รวมรายงานซ้ำ test จึงต้องไม่ผูกกับพฤติกรรม "ส่งซ้ำแล้วแยกรายการ"
- [ ] **`receivedAt` ที่ใช้เรียงใน RPT-REQ-010**: หมายถึงของการส่งล่าสุดในกลุ่ม ซึ่งจะมีความหมายจริงตอนทำ RPT-REQ-012

## Verification

- [ ] จบแต่ละขั้น: `npx vitest run tests/reports.test.ts` (หรือ `tests/rate-limit.test.ts`) ตามด้วย `npm test` และ `npm run lint`
- [ ] จบขั้น 8: `npm run dev` แล้ว `curl -X POST http://localhost:3000/districts/lat-phrao/reports` (ยิงที่ localhost เท่านั้น) จากนั้น `curl http://localhost:3000/districts/lat-phrao` ต้องเห็นรายงาน และยิงครั้งที่ 6 ต้องได้ 429
