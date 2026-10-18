import { describe, expect, it } from "vitest"
import {
  buildSightingEntity,
  dedupeKey,
  planAlert,
  SEVERE_GRACE_DAYS,
  type AlertRecord,
} from "./schema.ts"

const payloadToJson = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b))
const NOW = new Date("2026-10-18T10:00:00Z")
const base: AlertRecord = {
  source: "cdsco_portal_state_nsq",
  list_month: "2026-08",
  row: null,
  product: "Pantoprazole tablets IP 40 mg",
  batch: "0081",
  mfg_ym: "2026-05",
  expiry_ym: "2027-04",
  manufacturer: "M/s. Hindustan Antibiotics Ltd.",
  reason: "Dissolution",
  lab: "CDL, Kolkata",
  doc: "cdscoonline.gov.in portal",
  doc_sha256: "abc",
  doc_url: "https://example.test",
}

describe("planAlert", () => {
  it("skips batches that are already expired", () => {
    expect(planAlert({ ...base, expiry_ym: "2026-09" }, NOW).skip).toBe("expired")
  })
  it("skips records without a batch or product", () => {
    expect(planAlert({ ...base, batch: "--" }, NOW).skip).toBe("invalid")
    expect(planAlert({ ...base, product: "" }, NOW).skip).toBe("invalid")
  })
  it("keeps a batch that expires this month for at least a day", () => {
    expect(planAlert({ ...base, expiry_ym: "2026-10" }, NOW).skip).toBeUndefined()
  })
  it("creates a readonly entity with queryable attributes", () => {
    const p = planAlert(base, NOW)
    if (p.skip) throw new Error("expected create")
    const e = p.create
    expect(e.flags).toEqual({ readonly: true, permissionlessExtension: false })
    expect(e.attributes.batch_norm).toBe("0081")
    expect(e.attributes.authority).toBe("State drug lab")
    expect(e.attributes.app).toBe("dawa-alert")
    expect(Object.keys(e.attributes).length).toBeLessThanOrEqual(32)
  })
  it("payload keeps the verbatim fields and the proof", () => {
    const p = planAlert(base, NOW)
    if (p.skip) throw new Error("expected create")
    const j = payloadToJson(p.create.payload) as any
    expect(j.batch).toBe("0081")
    expect(j.proof.sha256).toBe("abc")
    expect(j.proof).toHaveProperty("extraction")
    expect(j.proof).toHaveProperty("retrieved_at")
    expect(j.manufacturer).toContain("Hindustan")
  })
  it("severe alerts outlive the printed expiry and may be extended by anyone", () => {
    const p = planAlert({ ...base, source: "who", reason: "Contaminated with diethylene glycol (DEG)", expiry_ym: "2026-12" }, NOW)
    if (p.skip) throw new Error("expected create")
    expect(p.create.flags.permissionlessExtension).toBe(true)
    // expired in Dec 2026 + grace, so it must still be storable even if the label date passed
    const late = planAlert({ ...base, source: "who", reason: "DEG", expiry_ym: "2026-09" }, NOW)
    expect(late.skip).toBeUndefined()
    expect(SEVERE_GRACE_DAYS).toBe(365)
  })
  it("a record with an unknown expiry is stored with a default lifetime and flagged", () => {
    const p = planAlert({ ...base, expiry_ym: null }, NOW)
    if (p.skip) throw new Error("expected create")
    expect(p.create.attributes.expiry_known).toBe(false)
  })
})

describe("dedupeKey", () => {
  it("is the same for the same batch from the same authority", () => {
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base, batch: "0 081", source: "cdsco_portal_state_nsq" }))
  })
  it("keeps the same product and batch from two different makers apart", () => {
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, manufacturer: "M/s. Some Other Pharma Pvt. Ltd., Baddi" }))
  })
  it("ignores the M/s. prefix, case and punctuation in the maker's name", () => {
    expect(dedupeKey(base)).toBe(dedupeKey({ ...base, manufacturer: "hindustan antibiotics ltd" }))
  })
  it("differs between authorities, so WHO + CDSCO both appear", () => {
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, source: "who" }))
  })
})

describe("buildSightingEntity", () => {
  it("stores place and role only, no free text", () => {
    const e = buildSightingEntity({ batch: "SR-13", pincode: "480001", reporterType: "chemist", seenOn: 20261018 })
    expect(e.attributes.pin3.value).toBe(480)
    expect(e.attributes.batch_norm).toBe("SR13")
    expect(Object.keys(payloadToJson(e.payload) as object)).toEqual(["batch"])
    expect(e.flags.readonly).toBe(true)
  })
})
