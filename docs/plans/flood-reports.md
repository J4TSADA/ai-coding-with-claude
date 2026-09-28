# Plan: รายงานจุดน้ำท่วมจากคนในพื้นที่

> Spec: docs/specs/flood-reports.md · Branch: feat/flood-reports

## Steps

- [x] 1. Tracer bullet: ส่งรายงานผ่าน API แล้วเห็นในรายการของเขต
  - Files: `src/reports.ts` (ใหม่), `src/app.ts`
  - Test first: POST /reports returns 201 (RPT-REQ-001) · GET /districts/:id/reports lists it with a notice (RPT-REQ-006, RPT-REQ-009)
- [x] 2. ระดับความรุนแรงจากความลึก
  - Files: `src/reports.ts`
  - Test first: severity levels 1–4 from depth (RPT-REQ-002)
- [ ] 3. ตรวจข้อมูล รวมรายงานซ้ำ และรายงานหมดอายุ
  - Files: `src/reports.ts`, `src/app.ts`
  - Test first: severity boundaries 10/11, 30/31, 50/51 (RPT-REQ-002) · invalid input gives 400 (RPT-REQ-003) · same spot within 2 h merges, just over 2 h does not (RPT-REQ-004) · expired after 6 h (RPT-REQ-005)
- [ ] 4. จำกัดจำนวนรายงาน และเบอร์โทรไม่หลุด
  - Files: `src/rate-limit.ts` (ใหม่), `src/app.ts`, `src/server.ts`
  - Test first: 6th report in 10 min from one IP gives 429 (RPT-REQ-007) · phone never in any response or log (RPT-REQ-008)

## Risks / unknowns

- Reports and the rate limit live in memory: one process only, lost on restart (fine for this round, noted)
- IP behind a proxy may be the proxy's IP (not handled this round)

## Decisions made while building

<!-- Append as you go: what changed from the plan, and why. -->
