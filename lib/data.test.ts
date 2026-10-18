import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadRecords } from "./records.ts"
import { planAlert } from "./schema.ts"
import { jsonToPayload } from "@arkiv-network/sdk/utils"
import { authorityOf as dedupeAuthority } from "./normalize.ts"

describe("CDSCO PDF parser (fixture: March 2025 central NSQ list)", () => {
  const out = join(mkdtempSync(join(tmpdir(), "dawa-")), "alerts.json")
  // The fixture dir holds only the hand-added PDF so the run is hermetic.
  const raw = mkdtempSync(join(tmpdir(), "dawa-raw-"))
  execFileSync("cp", ["data/raw/nsq-2025-03.pdf", raw])
  execFileSync("python3", ["-I", "scripts/parse_cdsco.py", "--raw", raw, "--out", out])
  const rows = JSON.parse(readFileSync(out, "utf8")) as any[]

  it("extracts every table row", () => expect(rows.length).toBe(70))
  it("reads the first known row exactly", () => {
    const r = rows.find((x) => x.batch === "SP240165")
    expect(r.product).toMatch(/Pantoprazole Gastro-Resistant Tablets IP/)
    expect(r.mfg_ym).toBe("2024-06")
    expect(r.expiry_ym).toBe("2026-05")
    expect(r.manufacturer).toMatch(/Shangrila Industries/)
    expect(r.lab).toBe("CDL, Kolkata")
  })
  it("parses every expiry date", () => expect(rows.filter((r) => !r.expiry_ym)).toEqual([]))
})

describe("bundled datasets", () => {
  const records = loadRecords()
  it("loads WHO annex batches for the three contaminated syrups", () => {
    const who = records.filter((r) => r.source === "who")
    expect(who.map((r) => r.batch).sort()).toEqual(["LSL25160", "R01GL2523", "SR-13"])
  })
  it("has CDSCO's own record of Coldrif SR-13 as well", () => {
    expect(records.some((r) => r.source.startsWith("cdsco") && /coldrif/i.test(r.product) && r.batch === "SR-13")).toBe(true)
  })
  it("has Telangana's stop-use notices, so Coldrif SR-13 is flagged by a state lab (via CDSCO's list), WHO and a state controller", () => {
    const authorities = new Set(
      records.filter((r) => r.batch === "SR-13" && /coldrif/i.test(r.product)).map((r) => dedupeAuthority(r.source)),
    )
    expect([...authorities].sort()).toEqual(["State drug controller", "State drug lab", "WHO"])
  })
  it("press-sourced state records are marked as such, not passed off as official PDFs", () => {
    for (const r of records.filter((x) => x.source.startsWith("state_dca"))) {
      expect(r.doc).toMatch(/press report/i)
      expect(r.doc_url).toMatch(/^https:\/\//)
    }
  })
  it("never loads the legacy PDF NSQ records (mangled names)", () => {
    expect(records.filter((r) => r.source === "cdsco_nsq" || r.source === "cdsco_state_nsq")).toEqual([])
    expect(records.filter((r) => r.source === "cdsco_spurious").length).toBeGreaterThan(0)
  })
  it("every record says how it was extracted", () => {
    const missing = records.filter((r) => !r.extraction)
    expect(missing.map((r) => `${r.source}:${r.batch}`)).toEqual([])
    expect(new Set(records.map((r) => r.extraction))).toEqual(
      new Set(["cdsco-json-api", "pdf-table-parse", "manual-from-who-annex", "press-report"]),
    )
  })
  it("every string attribute of every real record fits Arkiv's 128-byte limit", () => {
    const enc = new TextEncoder()
    const bad: string[] = []
    for (const r of records) {
      const p = planAlert(r, new Date("2025-01-01T00:00:00Z")) // early date so nothing is skipped as expired
      if (p.skip) continue
      for (const [k, v] of Object.entries(p.create.attributes)) {
        if (typeof v === "string" && enc.encode(v).length > 128) bad.push(`${k} of ${r.batch}`)
      }
      expect(p.create.payload.length).toBeLessThan(128 * 1024)
    }
    expect(bad).toEqual([])
  })
  it("every record has a batch and a product", () => {
    expect(records.filter((r) => !r.batch.trim() || !r.product.trim())).toEqual([])
  })
  it("most records can be planned against the real clock", () => {
    const plans = records.map((r) => planAlert(r))
    expect(plans.some((p) => !p.skip)).toBe(true)
  })
})
