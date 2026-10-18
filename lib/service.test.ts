import { describe, expect, it } from "vitest"
import { checkBatch, BadRequest, validateSighting } from "./service.ts"
import { fake, type Row } from "./fakeClient.ts"

const coldrif: Row = { kind: "alert", batch_norm: "SR13", authority: "WHO", severity: 3, product: "COLDRIF", batch: "SR-13" }
const coldrifCdsco: Row = { ...coldrif, authority: "CDSCO", product: "Coldrif Syrup (Paracetamol, Phenylephrine)" }
const collision: Row = { kind: "alert", batch_norm: "0081", authority: "CDSCO", severity: 1, product: "Pantoprazole tablets IP 40 mg", batch: "0081" }

describe("checkBatch", () => {
  it("flags a batch listed by two authorities and names both", async () => {
    const v = await checkBatch(fake([coldrif, coldrifCdsco]), { batch: "sr 13", product: "Coldrif" })
    expect(v.status).toBe("flagged")
    expect(v.severity).toBe(3)
    expect(v.authorities.sort()).toEqual(["CDSCO", "WHO"])
    expect(v.matches).toHaveLength(2)
  })

  it("not_found never claims the medicine is safe", async () => {
    const v = await checkBatch(fake([coldrif]), { batch: "ZZ99", product: "Dolo" })
    expect(v.status).toBe("not_found")
    expect(v.note).toMatch(/not proof that the medicine is safe/i)
    expect(v.matches).toEqual([])
  })

  it("same short batch number on a different product is only a possible match", async () => {
    const v = await checkBatch(fake([collision]), { batch: "0081", product: "Dolo 650" })
    expect(v.status).toBe("possible_match")
    expect(v.matches).toEqual([])
    expect(v.otherProducts).toHaveLength(1)
  })

  it("with no product, a short batch is ambiguous but a long unique one is flagged", async () => {
    expect((await checkBatch(fake([collision]), { batch: "0081" })).status).toBe("possible_match")
    expect((await checkBatch(fake([coldrif]), { batch: "SR13X-9" })).status).toBe("not_found")
    const long: Row = { ...coldrif, batch_norm: "R01GL2523", product: "Respifresh TR", batch: "R01GL2523" }
    expect((await checkBatch(fake([long]), { batch: "R01GL2523" })).status).toBe("flagged")
  })

  it("reports sightings by district prefix", async () => {
    const rows: Row[] = [coldrif, { kind: "sighting", batch_norm: "SR13", pin3: 480 }, { kind: "sighting", batch_norm: "SR13", pin3: 480 }, { kind: "sighting", batch_norm: "SR13", pin3: 600 }]
    const v = await checkBatch(fake(rows), { batch: "SR13", product: "Coldrif" })
    expect(v.sightings).toEqual({ count: 3, pin3: [480, 600] })
  })

  it("rejects an empty batch", async () => {
    await expect(checkBatch(fake([]), { batch: " -- " })).rejects.toBeInstanceOf(BadRequest)
  })
})

describe("validateSighting", () => {
  const ok = { batch: "SR-13", pincode: "480001", reporterType: "chemist" }
  it("accepts a good sighting", () => expect(validateSighting(ok).pincode).toBe("480001"))
  it("rejects a bad pincode", () => expect(() => validateSighting({ ...ok, pincode: "12345" })).toThrow(BadRequest))
  it("rejects an unknown reporter type", () => expect(() => validateSighting({ ...ok, reporterType: "hacker" })).toThrow(BadRequest))
  it("rejects a missing batch", () => expect(() => validateSighting({ ...ok, batch: "" })).toThrow(BadRequest))
  it("rejects a huge batch string", () => expect(() => validateSighting({ ...ok, batch: "A".repeat(41) })).toThrow(BadRequest))
})
