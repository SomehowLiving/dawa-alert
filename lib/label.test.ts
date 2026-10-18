import { describe, expect, it } from "vitest"
import { findBatch, findProduct, parseLabel } from "./label.ts"

describe("findBatch", () => {
  it.each([
    ["Batch No. A1254", "A1254"],
    ["B.No. SR-13", "SR-13"],
    ["B. No: R01GL2523", "R01GL2523"],
    ["BATCH NO : LSL25160", "LSL25160"],
    ["Lot 4032409004", "4032409004"],
    ["Batch Number: PBEAL001", "PBEAL001"],
    ["batch no, a1254", "A1254"], // OCR turns the full stop into a comma and lower-cases
  ])("%s -> %s", (line, want) => expect(findBatch(line)).toBe(want))

  it("reads a real, messy OCR pass: keeps what it can see, never invents the rest", () => {
    // Actual Tesseract output for a tilted label whose true batch is A1254.
    expect(findBatch("Coldrif\nCough Sy, up\nBatch No, A12\nMfg. Date 12/20\nExp. Date 11/2")).toBe("A12")
  })
  it("ignores keyword followed by a word, not a batch", () => {
    expect(findBatch("Batch No. Date")).toBeNull()
    expect(findBatch("Mfg. Date 12/2024")).toBeNull()
  })
  it("requires a digit, so ordinary words are not batches", () => expect(findBatch("Lot Number Mfg")).toBeNull())
  it("returns null when there is no keyword at all", () => expect(findBatch("Coldrif Cough Syrup 100 ml")).toBeNull())
  it("does not read the expiry as the batch", () => expect(findBatch("Exp. Date 11/2026")).toBeNull())
})

describe("findProduct", () => {
  const L = (text: string, h: number) => ({ text, h })
  it("picks the tallest name-like line", () => {
    expect(findProduct([L("Coldrif", 99), L("Cough Syrup", 60), L("Batch No. A1254", 70)])).toBe("Coldrif")
  })
  it("skips label words and number-heavy lines", () => {
    expect(findProduct([L("Mfg. Date 12/2024", 120), L("Exp 11/2026", 118), L("Dolo 650", 40)])).toBe("Dolo 650")
  })
  it("ignores low-confidence lines, so a garbled name is never suggested", () => {
    expect(findProduct([{ text: "Ehrymgy", h: 120, conf: 41 }, { text: "Coldrif", h: 80, conf: 93 }])).toBe("Coldrif")
    expect(findProduct([{ text: "Ehrymgy", h: 120, conf: 41 }])).toBeNull()
  })
  it("returns null for noise", () => expect(findProduct([L("h 4 =", 36), L("/ i —", 106)])).toBeNull())
  it("handles missing input", () => expect(findProduct(undefined)).toBeNull())
})

describe("parseLabel", () => {
  it("scores a reading with a batch above one without", () => {
    const good = parseLabel("Batch No. A1254", [])
    const bad = parseLabel("Coldrif only", [{ text: "Coldrif", h: 50 }])
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.batch).toBe("A1254")
    expect(bad.product).toBe("Coldrif")
  })
})
