import { describe, expect, it } from "vitest"
import {
  authorityOf,
  isPincode,
  normBatch,
  normProduct,
  productSimilarity,
  severityOf,
  ymToEndOfMonth,
  ymToInt,
} from "./normalize.ts"

describe("normBatch", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normBatch("SR-13")).toBe("SR13")
    expect(normBatch(" sr 13 ")).toBe("SR13")
    expect(normBatch("R01.GL/2523")).toBe("R01GL2523")
  })
  it("keeps leading zeros", () => expect(normBatch("0081")).toBe("0081"))
  it("is empty for junk", () => expect(normBatch("--- ")).toBe(""))
})

describe("productSimilarity", () => {
  it("matches a brand against the long CDSCO name", () => {
    expect(productSimilarity("Coldrif", "Coldrif Syrup (Paracetamol, Phenylephrine HCl & Chlorpheniramine Maleate)")).toBe(1)
  })
  it("ignores dosage words", () => {
    expect(productSimilarity("Pantoprazole tablets IP 40 mg", "Pantoprazole Gastro-Resistant Tablets IP (Pantoshang-40)")).toBeGreaterThanOrEqual(0.5)
  })
  it("rejects unrelated products", () => {
    expect(productSimilarity("Dolo 650", "Coldrif Syrup")).toBe(0)
  })
  it("is 0 for empty input", () => expect(productSimilarity("", "x")).toBe(0))
})

describe("normProduct", () => {
  it("lower-cases and collapses punctuation", () => {
    expect(normProduct("Telma-AM (40/5) Tab.")).toBe("telma am 40 5 tab")
  })
})

describe("dates", () => {
  it("expiry month runs to the end of that month (UTC)", () => {
    expect(ymToEndOfMonth("2026-11")?.toISOString()).toBe("2026-11-30T23:59:58.000Z")
    expect(ymToEndOfMonth("2028-02")?.getUTCDate()).toBe(29) // leap year
  })
  it("rejects malformed months", () => {
    expect(ymToEndOfMonth("2026-13")).toBeNull()
    expect(ymToEndOfMonth("Nov-2026")).toBeNull()
  })
  it("encodes year-month as a sortable int", () => {
    expect(ymToInt("2026-08")).toBe(202608)
    expect(ymToInt(null)).toBe(0)
  })
})

describe("severityOf / authorityOf", () => {
  it("flags DEG contamination as severe", () => {
    expect(severityOf("who", "Contaminated with diethylene glycol (DEG): 48.6% w/v")).toBe(3)
    expect(severityOf("cdsco_portal_nsq", "Presence of Ethylene Glycol")).toBe(3)
  })
  it("does not mistake ordinary words for DEG/EG", () => {
    expect(severityOf("cdsco_nsq", "Assay of degraded active; description")).toBe(1)
  })
  it("spurious is 2, plain NSQ is 1", () => {
    expect(severityOf("cdsco_spurious", "Does not conform")).toBe(2)
    expect(severityOf("cdsco_state_nsq", "Dissolution")).toBe(1)
  })
  it("names the issuing body", () => {
    expect(authorityOf("who")).toBe("WHO")
    expect(authorityOf("cdsco_portal_state_nsq")).toBe("State drug lab")
    expect(authorityOf("cdsco_portal_nsq")).toBe("CDSCO")
  })
})

describe("isPincode", () => {
  it.each([["480001", true], ["110001", true], ["012345", false], ["48000", false], ["4800011", false], ["abcdef", false]])(
    "%s -> %s",
    (v, ok) => expect(isPincode(v as string)).toBe(ok),
  )
})

import { normMfr } from "./normalize.ts"
describe("normMfr / state controller authority", () => {
  it("drops M/s. and keeps the first words of the maker", () => {
    expect(normMfr("M/s. Hindustan Antibiotics Ltd., Pimpri, Pune-411018, INDIA")).toBe("hindustan antibiotics ltd pimpri pune")
    expect(normMfr("Sresan Pharma, Kancheepuram")).toBe("sresan pharma kancheepuram")
  })
  it("labels Telangana DCA notices as state drug controller", () => {
    expect(authorityOf("state_dca_telangana")).toBe("State drug controller")
  })
})
