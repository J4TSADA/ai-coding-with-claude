import { describe, expect, it } from "vitest"
import { toBangkokIso } from "../src/time.ts"

describe("toBangkokIso", () => {
  it("shows UTC time as Bangkok time (UTC+7)", () => {
    expect(toBangkokIso(new Date("2026-09-30T12:00:00Z"))).toBe("2026-09-30T19:00:00+07:00")
  })

  it("rolls over to the next day", () => {
    expect(toBangkokIso(new Date("2026-09-30T20:30:00Z"))).toBe("2026-10-01T03:30:00+07:00")
  })
})
