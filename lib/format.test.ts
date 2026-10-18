import { describe, expect, it } from "vitest"
import { entityUrl, EXPLORER_URL, fmtMmYyyy, fmtYm, shortKey } from "./format.ts"

const KEY = "0xd867bbbb84289fd4964271ad9d6b406a3acc1e08bd552a7574834b65bbbb0304"

describe("entityUrl", () => {
  it("points at the data explorer's own ?q= lookup for the key", () => {
    expect(entityUrl(KEY)).toBe(`https://data.arkiv.network/?q=${KEY}`)
  })
  it("falls back to the explorer home for anything that is not a 32-byte key", () => {
    for (const bad of ["", "0x1234", "d867bbbb", `${KEY}00`, "javascript:alert(1)", `${KEY}&x=<script>`]) expect(entityUrl(bad)).toBe(EXPLORER_URL)
  })
})

describe("date and key formatting", () => {
  it("formats list months and pack dates", () => {
    expect(fmtYm("2026-08")).toBe("Aug 2026")
    expect(fmtMmYyyy("2027-04")).toBe("04/2027")
    expect(fmtYm(null, "n/a")).toBe("n/a")
  })
  it("shortens a key", () => expect(shortKey(KEY)).toBe("0xd867bb…bb0304"))
})
