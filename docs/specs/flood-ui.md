# Spec: หน้าแผนที่น้ำท่วม (demo บน Cloudflare Workers)

> สถานะ: ร่างรอบ 2 (2026-10-01) เปลี่ยนจากหน้าแบบรายการเป็นแผนที่ รอเจ้าของฟีเจอร์ยืนยัน
> ต่อจาก: [`docs/specs/flood-reports.md`](flood-reports.md) (หัวข้อ Out of scope ที่บอกว่า "หน้าเว็บ/ฟอร์ม (รอบนี้มีแค่ API)")
> ข้อบังคับ: ทุกข้อใน skill `security-baseline` และ [ADR 0001](../adr/0001-maplibre-pmtiles-basemap.md) (host ไฟล์แผนที่ทุกอย่างเอง)
>
> การตัดสินใจจากเจ้าของฟีเจอร์ (2026-10-01)
> - หน้าเว็บมี**เฉพาะบน worker demo** `npm run dev` (`src/server.ts`) ไม่เปลี่ยน
> - `GET /` เป็นหน้าเว็บ รายการ endpoint อยู่ที่ `GET /api`
> - หน้าเว็บเป็น**แผนที่** ดัดแปลงจาก upstream `feat/fm-01` ถึง `fm-04` (MapLibre GL + PMTiles host เอง)
> - แผนที่พื้นหลัง `public/tiles/bangkok.pmtiles` ตัดจาก Protomaps build 20261001 ที่ maxzoom 14 (22.2 MiB ต่ำกว่าเพดาน 25 MiB ของ Workers) ไม่อยู่ใน git สร้างใหม่ตามหัวข้อ Design

## คำศัพท์

| คำ | ความหมาย |
| --- | --- |
| **หน้าเว็บ** | ไฟล์ใน `public/` ที่ Workers Static Assets เสิร์ฟก่อนถึง `src/worker.ts` |
| **กึ่งกลางเขต** | `[lon, lat]` โดยประมาณของเขต ใช้วางหมุด ไม่ใช่ตำแหน่งของผู้รายงาน |
| **หมุด** | จุดบนแผนที่ รายงานวางรอบกึ่งกลางเขตแบบคงที่ตามจุดสังเกต สถานีวางที่กึ่งกลางเขต |
| **ข้อความจากผู้ใช้** | ค่าที่มาจากรายงาน เช่น `landmark` ต้องแสดงเป็นข้อความเสมอ ห้ามตีความเป็น HTML |

---

## Requirements

### UI-REQ-001 `GET /` ได้หน้าแผนที่

- [ ] `wrangler.jsonc` มี `assets.directory` เป็น `./public` และ `public/index.html` มีอยู่
- [ ] `index.html` มี `<html lang="th">`, `<meta charset="utf-8">`, viewport และ `<title>น้ำท่วมไหม</title>`
- [ ] หน้าเว็บมีแผนที่ (`#map`), แผงสรุปจำนวนจุดตามระดับความรุนแรง, ปุ่มกรองตามเขต และรายการรายงาน

### UI-REQ-002 endpoint ของ demo

- [ ] `GET /api` ได้ `{ notice: NOTICE, endpoints: [...] }` มี `"/api/centres"` และ `"/districts/chatuchak/reports"`
- [ ] `GET /api/centres` ได้ `{ notice: NOTICE, centres }` มีครบทุก id ใน `districts` แต่ละค่าเป็น `[lon, lat]` อยู่ในกรอบกรุงเทพฯ (lon 100.3–100.95, lat 13.5–14.05)
- [ ] กึ่งกลางเขตอยู่ใน `src/district-centres.ts` ไม่แก้ `src/districts.ts`

### UI-REQ-003 ประกาศว่าไม่ใช่ข้อมูลทางการแสดงเสมอ

- [ ] `index.html` มีข้อความ `NOTICE` และ `REPORT_NOTICE` ตรงตัว (เห็นได้โดยไม่ต้องรอ JavaScript)
- [ ] ทุกรายงานในรายการแสดง `disclaimer` ของรายงานนั้น และ popup ของหมุดรายงานขึ้นต้นด้วย `disclaimer`
- [ ] popup ของหมุดรายงานบอก "ตำแหน่งโดยประมาณ" ส่วนสถานีบอก "ข้อมูลสมมติ"

### UI-REQ-004 แสดงรายงานตามความรุนแรง

- [ ] ระดับความรุนแรงใช้ id และป้ายจาก API (`severity.level`, `severity.labelTh`) 4 ระดับตาม RPT-REQ-009
- [ ] รายการเรียงจากรุนแรงมากไปน้อย ระดับเท่ากันเรียงตาม `seenAt` ใหม่ไปเก่า แล้วตาม `id`
- [ ] แผงสรุปนับจำนวนจุดต่อระดับ ตามเขตที่กรองอยู่
- [ ] สีของระดับมีข้อความกำกับเสมอ (ไม่สื่อด้วยสีอย่างเดียว)
- [ ] รายงานแสดงความลึกเป็น ซม. จำนวนเต็มตามที่ API ส่ง และเวลา HH:MM น. จาก `seenAt` (+07:00)
- [ ] โหลดข้อมูลไม่สำเร็จแสดง "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" ไม่แสดง error ดิบ
- [ ] ไม่มีไฟล์แผนที่พื้นหลังหรือโหลด MapLibre ไม่ได้ หน้าเว็บยังใช้งานได้และบอกสถานะ

### UI-REQ-005 ข้อความจากผู้ใช้แสดงเป็นข้อความเท่านั้น

- [ ] `app.js` และ `logic.js` ไม่มี `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` หรือ `eval(`
- [ ] ข้อมูลจาก API เข้าหน้าเว็บผ่าน `textContent` / `createElement` และ popup ใช้ `setDOMContent` ไม่ใช้ `setHTML`

### UI-REQ-006 ไม่โหลดอะไรจากเว็บอื่น และมี header ความปลอดภัย

- [ ] `index.html`, `app.js`, `logic.js`, `app.css` ไม่มี URL ภายนอก ยกเว้นที่ไม่ได้โหลด: SVG namespace และลิงก์ attribution ของ OpenStreetMap / Protomaps
- [ ] ไฟล์ใน `public/vendor/` ตรงกับ `public/vendor/SHA256SUMS`
- [ ] `public/_headers` ใส่ `X-Content-Type-Options: nosniff` และ `Content-Security-Policy` ที่มี `script-src 'self'`, `connect-src 'self'`, `form-action 'none'`, `frame-ancestors 'none'` ให้ทุก path

### UI-REQ-008 ไฟล์แผนที่พื้นหลังตอบ Range request

Workers Static Assets ส่งไฟล์เต็มแม้มี header `Range` (ทดสอบกับ `wrangler dev` 2026-10-01) แต่ PMTiles ต้องได้ `206`

- [ ] `wrangler.jsonc` ตั้ง `assets.binding: "ASSETS"` และ `run_worker_first: ["/tiles/*"]`
- [ ] `GET /tiles/bangkok.pmtiles` ที่มี `Range: bytes=a-b`, `a-` หรือ `-n` ได้ `206` พร้อม `content-range` และ byte ตรงกับไฟล์
- [ ] range ที่ใช้ไม่ได้ได้ `416` ไม่มี `Range` ได้ไฟล์เต็ม `200`
- [ ] `parseRange` รับ range เดียวเท่านั้น (test ใน `tests/worker.test.ts`)

### UI-REQ-007 demo ยังอ่านอย่างเดียว

- [ ] หน้าเว็บไม่มี `<form>` และ `app.js` ไม่ส่ง method อื่นนอกจาก GET
- [ ] `POST` ที่ worker ยังได้ `405` และ path ที่ไม่รู้จักยังได้ `404` JSON

---

## Design

- `public/`: `index.html`, `app.js` (DOM + แผนที่), `logic.js` (ไม่มี DOM, test ได้), `app.css`, `_headers`, ฟอนต์ Noto Sans Thai และ `vendor/` (MapLibre, pmtiles, basemaps, glyphs, sprites) จาก upstream ตาม ADR 0001
- glyphs บนดิสก์ชื่อ `noto-sans-regular` แต่ MapLibre ขอ `Noto%20Sans%20Regular` จึงแปลง URL ใน `transformRequest` ของ `app.js`
- `src/worker.ts`: เพิ่ม `/api/centres` ส่วนหน้าเว็บไม่ผ่าน worker แล้ว (ลบ `src/page.ts`)
- ไฟล์แผนที่พื้นหลังวางที่ `public/tiles/bangkok.pmtiles` (อยู่ใน `.gitignore` แต่ `wrangler deploy` อัปโหลดเพราะอยู่ใน `public/`) สร้างด้วย [pmtiles CLI](https://docs.protomaps.com/pmtiles/cli):
  `pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/tiles/bangkok.pmtiles --bbox=100.30,13.50,100.95,14.05 --maxzoom=14`
  ใช้ build ที่ schema ตรงกับ `basemaps.js` (v4) ถ้าไฟล์เกิน 25 MiB ต้องย้ายไป R2
- `/tiles/*` ผ่าน worker ก่อน (`serveTiles`) เพื่อตอบ `206` ตัดช่วงจากไฟล์ใน `ASSETS`
- ไม่เพิ่ม dependency ใน `package.json` ไม่แก้ `src/app.ts`, `src/reports.ts`, `src/server.ts`, `src/districts.ts` และ `NOTICE`

## ร่าง test (เจ้าของฟีเจอร์เป็นคนวางใน `tests/worker.test.ts`)

hook `guard-tests.sh` ห้าม Claude แก้ไฟล์ test ให้**แทน** `describe("web page", ...)` เดิมทั้งก้อน (และ `const text = ...` เหนือมัน) ด้วยโค้ดนี้ แล้วเพิ่ม import ด้านบนของไฟล์

```ts
// เพิ่มที่ด้านบนของไฟล์ (NOTICE กับ REPORT_NOTICE import อยู่แล้ว)
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { districts } from "../src/districts.ts"
```

```ts
const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const textOf = (path: string) => file(path).toString("utf8")

/** Outside URLs the page may mention because it never loads them. */
const NOT_LOADED = new Set(["http://www.w3.org/2000/svg", "https://openstreetmap.org/copyright", "https://protomaps.com"])

type Logic = {
  bySeverity: (a: unknown, b: unknown) => number
  countBySeverity: (reports: unknown[], filter: string) => Record<string, number>
}
const logic = (): Logic => {
  const window: { NAMTUAM_LOGIC?: Logic } = {}
  runInNewContext(textOf("public/logic.js"), { window })
  return window.NAMTUAM_LOGIC as Logic
}
const report = (id: string, level: string, seenAt: string, districtId = "chatuchak") => ({ id, districtId, seenAt, severity: { level } })

describe("map page", () => {
  it("is served from public/ by Workers Static Assets", () => {
    expect(textOf("wrangler.jsonc")).toMatch(/"assets":\s*\{\s*"directory":\s*"\.\/public"/)
    const html = textOf("public/index.html")
    expect(html).toContain('<html lang="th">')
    expect(html).toContain('id="map"')
  })

  it("shows both notices without JavaScript", () => {
    const html = textOf("public/index.html")
    expect(html).toContain(NOTICE)
    expect(html).toContain(REPORT_NOTICE)
  })

  it("lists the endpoints at /api", async () => {
    const res = get("/api")
    expect(res.status).toBe(200)
    const { endpoints } = (await res.json()) as { endpoints: string[] }
    expect(endpoints).toContain("/api/centres")
    expect(endpoints).toContain("/districts/chatuchak/reports")
  })

  it("gives a centre inside Bangkok for every district", async () => {
    const res = get("/api/centres")
    expect(res.status).toBe(200)
    const { notice, centres } = (await res.json()) as { notice: string; centres: Record<string, [number, number]> }
    expect(notice).toBe(NOTICE)
    expect(Object.keys(centres).sort()).toEqual([...districts.keys()].sort())
    for (const [lon, lat] of Object.values(centres)) {
      expect(lon).toBeGreaterThanOrEqual(100.3)
      expect(lon).toBeLessThanOrEqual(100.95)
      expect(lat).toBeGreaterThanOrEqual(13.5)
      expect(lat).toBeLessThanOrEqual(14.05)
    }
  })

  it("loads nothing from another site", () => {
    for (const path of ["public/index.html", "public/app.js", "public/logic.js", "public/app.css"]) {
      const urls = textOf(path).match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []
      expect(urls.filter((url) => !NOT_LOADED.has(url)), path).toEqual([])
    }
  })

  it("ships vendored map files that match SHA256SUMS", () => {
    const lines = textOf("public/vendor/SHA256SUMS").trim().split("\n")
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const [hash, path] = line.trim().split(/\s+/)
      expect(createHash("sha256").update(file(`public/vendor/${path}`)).digest("hex"), path).toBe(hash)
    }
  })

  it("sets security headers for every path", () => {
    const headers = textOf("public/_headers")
    expect(headers).toMatch(/^\/\*$/m)
    expect(headers).toContain("X-Content-Type-Options: nosniff")
    for (const rule of ["script-src 'self'", "connect-src 'self'", "form-action 'none'", "frame-ancestors 'none'"]) {
      expect(headers).toContain(rule)
    }
  })

  it("never builds HTML from data and only reads", () => {
    for (const path of ["public/app.js", "public/logic.js"]) {
      const js = textOf(path)
      for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "setHTML"]) {
        expect(js, `${path} ${sink}`).not.toContain(sink)
      }
      expect(js).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/)
    }
    expect(textOf("public/app.js")).toContain("textContent")
    expect(textOf("public/index.html")).not.toContain("<form")
  })

  it("sorts reports deepest first, then newest, then id", () => {
    const L = logic()
    const list = [
      report("b", "wet", "2026-09-30T19:00:00+07:00"),
      report("c", "dangerous", "2026-09-30T18:00:00+07:00"),
      report("a", "dangerous", "2026-09-30T18:00:00+07:00"),
      report("d", "dangerous", "2026-09-30T19:00:00+07:00")
    ].sort(L.bySeverity)
    expect(list.map((r) => r.id)).toEqual(["d", "a", "c", "b"])
  })

  it("counts reports per severity for the chosen district", () => {
    const L = logic()
    const list = [report("a", "wet", "x"), report("b", "dangerous", "x"), report("c", "dangerous", "x", "lat-phrao")]
    expect({ ...L.countBySeverity(list, "all") }).toEqual({ wet: 1, "hard-for-small-cars": 0, "unsafe-for-small-cars": 0, dangerous: 2 })
    expect(L.countBySeverity(list, "chatuchak").dangerous).toBe(1)
  })

  it("keeps unknown paths a 404 and writes a 405", () => {
    expect(get("/nope").status).toBe(404)
    expect(get("/constructor").status).toBe(404)
    expect(get("/api/centres", "POST").status).toBe(405)
  })
})
```

## Out of scope (รอบนี้ไม่ทำ)

- ไฟล์แผนที่พื้นหลัง `bangkok.pmtiles` และที่เก็บบน R2
- ฟอร์มส่งรายงาน และโหมดข้อมูลจำลอง (`demo.js`) ของ upstream
- พิกัดจริงของรายงาน
- หน้าเว็บบน `npm run dev` (`src/server.ts`)
- test การทำงานของ `app.js` ในเบราว์เซอร์จริง (ตรวจด้วยมือผ่าน `npx wrangler dev` บน localhost)
- ดึงหรือส่งข้อมูลกับ Flood Watch จริงทุกรูปแบบ
