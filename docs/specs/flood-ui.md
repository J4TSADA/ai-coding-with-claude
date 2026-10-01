# Spec: หน้าเว็บดูรายงานน้ำท่วม (demo บน Cloudflare Workers)

> สถานะ: ร่าง (2026-10-01) รอเจ้าของฟีเจอร์ยืนยัน
> ต่อจาก: [`docs/specs/flood-reports.md`](flood-reports.md) (หัวข้อ Out of scope ที่บอกว่า "หน้าเว็บ/ฟอร์ม (รอบนี้มีแค่ API)")
> ข้อบังคับ: ทุกข้อใน skill `security-baseline` (`.claude/skills/security-baseline/SKILL.md`)
>
> การตัดสินใจจากเจ้าของฟีเจอร์ (2026-10-01)
> - หน้าเว็บมี**เฉพาะบน worker** (`src/worker.ts`) `npm run dev` (`src/server.ts`) ไม่เปลี่ยน
> - `GET /` เปลี่ยนจาก JSON เป็นหน้า HTML รายการ endpoint ย้ายไปที่ `GET /api`

## คำศัพท์

| คำ | ความหมาย |
| --- | --- |
| **หน้าเว็บ** | HTML ที่ `GET /` ของ worker ส่ง พร้อม `/app.css` และ `/app.js` |
| **asset** | `/app.css` และ `/app.js` ข้อความคงที่ที่ worker ส่งเอง ไม่โหลดอะไรจากโดเมนอื่น |
| **ข้อความจากผู้ใช้** | ค่าที่มาจากรายงาน เช่น `landmark` ต้องแสดงเป็นข้อความเสมอ ห้ามตีความเป็น HTML |

test ของฟีเจอร์นี้เรียก `worker.fetch(new Request("https://demo.example/..."))` ตรงๆ เหมือน `tests/worker.test.ts` ไม่เปิด server ไม่เรียกโดเมนจริง

---

## Requirements

### UI-REQ-001 `GET /` ได้หน้า HTML

- [ ] `GET /` ได้ `200` และ `content-type` เป็น `text/html; charset=utf-8`
- [ ] HTML มี `<html lang="th">`, `<meta charset="utf-8">`, `<meta name="viewport" ...>` และ `<title>น้ำท่วมไหม</title>`
- [ ] HTML โหลดเฉพาะ `/app.css` และ `/app.js` (ไม่มี `http://` หรือ `https://` ใน `src=` หรือ `href=`)

### UI-REQ-002 รายการ endpoint ย้ายไป `GET /api`

- [ ] `GET /api` ได้ `200` JSON `{ notice: NOTICE, endpoints: [...] }` รายการเดิม และมี `"/districts/chatuchak/reports"`
- [ ] `GET /` ไม่ใช่ JSON อีกต่อไป

### UI-REQ-003 ประกาศว่าไม่ใช่ข้อมูลทางการแสดงเสมอ

- [ ] HTML ของ `GET /` มีข้อความ `NOTICE` ตรงตัว (ไม่ต้องรอ JavaScript)
- [ ] HTML ของ `GET /` มีข้อความ `REPORT_NOTICE` ตรงตัว อยู่เหนือรายการรายงาน
- [ ] ทุกรายงานที่หน้าเว็บแสดงมีป้าย "ผู้ใช้รายงาน" (ข้อความจาก `disclaimer` ของรายงานนั้น)

### UI-REQ-004 เลือกเขตแล้วเห็นข้อมูลของเขตนั้น

หน้าเว็บเรียก API เดิมด้วย `fetch` แบบ GET เท่านั้น

- [ ] มีตัวเลือกเขต (`<select>`) ครบ 12 เขตจาก `GET /districts` แสดง `nameTh`
- [ ] เลือกเขตแล้วเรียก `GET /districts/:id` แสดงสถานีวัดน้ำ (ชื่อ, ระดับน้ำ ซม., เวลา) และรายงาน
- [ ] รายงานแต่ละรายการแสดง: จุดสังเกต, ความลึก (ซม. จำนวนเต็มตามที่ API ส่ง), `severity.labelTh`, เวลา `seenAt` ตามที่ API ส่ง (+07:00 แสดงเป็น HH:MM น.), จำนวนคนยืนยัน (`confirmations`)
- [ ] ระดับความรุนแรงมีสีต่างกันตาม `severity.level` และมีข้อความกำกับเสมอ (ไม่สื่อด้วยสีอย่างเดียว)
- [ ] เขตที่ไม่มีรายงานแสดง "ยังไม่มีรายงานในเขตนี้"
- [ ] เรียก API ไม่สำเร็จแสดง "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" ไม่แสดง error ดิบ
- [ ] เขตที่เลือกอยู่ใน URL (`/?district=chatuchak`) เปิดลิงก์แล้วได้เขตเดิม ค่าที่ไม่ใช่ id ใน `/districts` ถูกเมิน

### UI-REQ-005 ข้อความจากผู้ใช้แสดงเป็นข้อความเท่านั้น

- [ ] `app.js` ใส่ข้อมูลจาก API ด้วย `textContent` หรือ `document.createElement` เท่านั้น
- [ ] `app.js` ไม่มี `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` หรือ `eval` (test ตรวจข้อความใน asset)

### UI-REQ-006 header ความปลอดภัย

- [ ] `GET /`, `/app.css`, `/app.js` มี `x-content-type-options: nosniff`
- [ ] `GET /` มี `content-security-policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- [ ] `/app.css` ได้ `text/css; charset=utf-8` และ `/app.js` ได้ `text/javascript; charset=utf-8`

### UI-REQ-007 demo ยังอ่านอย่างเดียว

- [ ] หน้าเว็บไม่มี `<form>` และ `app.js` ไม่ส่ง method อื่นนอกจาก GET
- [ ] `POST` ทุก path ยังได้ `405` เหมือนเดิม (test เดิม "refuses writes")
- [ ] path ที่ไม่รู้จักยังได้ `404` JSON เหมือนเดิม

---

## Design

- `src/page.ts` (ใหม่): export `PAGE_HTML`, `APP_CSS`, `APP_JS` เป็น string คงที่ `PAGE_HTML` สร้างจาก `NOTICE` และ `REPORT_NOTICE` ที่ import มา (ไม่พิมพ์ข้อความซ้ำ)
- `src/worker.ts`: เพิ่ม route `/` (HTML), `/app.css`, `/app.js`, `/api` (JSON เดิม) และ header ตาม UI-REQ-006
- ไม่แก้ `src/app.ts`, `src/reports.ts`, `src/server.ts`, `NOTICE` และไฟล์ที่ CLAUDE.md ห้ามแตะ
- ไม่เพิ่ม dependency ไม่ใช้ framework ไม่ใช้ฟอนต์หรือ CDN ภายนอก
- รองรับจอมือถือ (กว้าง 360px) และ dark mode ผ่าน `prefers-color-scheme`

## ร่าง test (เจ้าของฟีเจอร์เป็นคนวางใน `tests/worker.test.ts`)

hook `guard-tests.sh` ห้าม Claude แก้ไฟล์ test ร่างนี้ให้คนก๊อปไปวาง และแก้ test เดิม "lists the endpoints at the root" ให้ใช้ `/api`

```ts
import { NOTICE } from "../src/app.ts"
import { REPORT_NOTICE } from "../src/reports.ts"

const text = async (path: string) => (await get(path)).text()

describe("web page", () => {
  it("lists the endpoints at /api", async () => {
    const res = get("/api")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { endpoints: string[] }).endpoints).toContain("/districts/chatuchak/reports")
  })

  it("serves HTML at the root with both notices", async () => {
    const res = get("/")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    const html = await res.text()
    expect(html).toContain('<html lang="th">')
    expect(html).toContain(NOTICE)
    expect(html).toContain(REPORT_NOTICE)
    expect(html).not.toMatch(/(src|href)="https?:/)
    expect(html).not.toContain("<form")
  })

  it("sets security headers", () => {
    const res = get("/")
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'")
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'")
    for (const path of ["/", "/app.css", "/app.js"]) {
      expect(get(path).headers.get("x-content-type-options")).toBe("nosniff")
    }
  })

  it("serves the assets with the right types", () => {
    expect(get("/app.css").headers.get("content-type")).toBe("text/css; charset=utf-8")
    expect(get("/app.js").headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })

  it("never builds HTML from data in app.js", async () => {
    const js = await text("/app.js")
    for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
      expect(js).not.toContain(sink)
    }
    expect(js).toContain("textContent")
    expect(js).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/)
  })
})
```

## Out of scope (รอบนี้ไม่ทำ)

- ฟอร์มส่งรายงาน (demo รับแค่ GET)
- แผนที่, พิกัด, รูปภาพ
- หน้าเว็บบน `npm run dev` (`src/server.ts`)
- test การทำงานของ `app.js` ในเบราว์เซอร์จริง (ตรวจด้วยมือผ่าน `npx wrangler dev` บน localhost)
- ดึงหรือส่งข้อมูลกับ Flood Watch จริงทุกรูปแบบ
