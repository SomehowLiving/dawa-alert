import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { normBatch, normMfr, normProduct } from "./normalize.ts"
import { LEGACY_SOURCES, type AlertRecord } from "./schema.ts"

const FILES = ["alerts_who.json", "alerts_state.json", "alerts_portal.json", "alerts.json"] // earlier files win on duplicates

/** Load every dataset in data/, de-duplicated on (authority-agnostic) product + batch within a source family. */
export function loadRecords(dir = "data"): AlertRecord[] {
  const seen = new Set<string>()
  const out: AlertRecord[] = []
  for (const f of FILES) {
    const p = join(dir, f)
    if (!existsSync(p)) continue
    for (const r of JSON.parse(readFileSync(p, "utf8")) as AlertRecord[]) {
      if (LEGACY_SOURCES.has(r.source)) continue // mangled PDF names; the portal has clean rows for the same batches
      const k = `${r.source.startsWith("cdsco_portal") ? "cdsco" : r.source}|${normBatch(r.batch)}|${normProduct(r.product)}|${normMfr(r.manufacturer)}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
  }
  return out
}
