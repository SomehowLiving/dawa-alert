// Pure helpers: no network, no Arkiv. Everything here is unit-tested.

/** Batch numbers are typed by hand off a label, so compare them loosely: "SR-13" == "sr 13" == "SR13". */
export function normBatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_KEY)
}

/** Lower-case words joined by single spaces; usable with Arkiv's STARTSWITH. */
export function normProduct(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Arkiv caps a string attribute at 128 bytes. Keys are ASCII after normalisation, so 100 chars is safe;
 *  the full name stays in the payload. STARTSWITH on a clipped key still finds the product. */
export const MAX_KEY = 100
export function productKey(s: string): string {
  return normProduct(s).slice(0, MAX_KEY).trimEnd()
}

const STOP = new Set(["tablet", "tablets", "tab", "injection", "inj", "syrup", "suspension", "capsule", "capsules", "ip", "bp", "usp", "mg", "ml", "and", "oral", "solution", "w", "v", "the", "of", "sterile"])

function tokens(s: string): string[] {
  return normProduct(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/**
 * How well two product names agree, 0..1: the share of the shorter name's tokens found in the
 * other. Brand names matter more than dosage words, hence the stop-list.
 */
export function productSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = new Set(tokens(b))
  if (ta.length === 0 || tb.size === 0) return 0
  const tbArr = [...tb]
  const [short, long] = ta.length <= tbArr.length ? [ta, tb] : [tbArr, new Set(ta)]
  return short.filter((t) => long.has(t)).length / short.length
}

/** "2026-11" -> 2026-11-30T23:59:58Z (a batch is good until the end of its expiry month). */
export function ymToEndOfMonth(ym: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return new Date(Date.UTC(y, mo, 0, 23, 59, 58))
}

/** "2026-08" -> 202608, for range queries on an integer attribute. */
export function ymToInt(ym: string | null | undefined): number {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "")
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0
}

export type Severity = 1 | 2 | 3

/**
 * 3 = contamination that has killed people (DEG/EG), 2 = spurious/falsified, 1 = not of
 * standard quality. Deliberately coarse: the reason text is kept verbatim in the payload.
 */
export function severityOf(source: string, reason: string): Severity {
  if (/\b(diethylene|ethylene)\s*glycol\b|\bDEG\b|\bEG\b/i.test(reason)) return 3
  if (source.includes("spurious") || /spurious|falsified|counterfeit/i.test(reason)) return 2
  return 1
}

/** Which body raised the alert. Several bodies on one batch is the point of the product. */
export function authorityOf(
  source: string,
): "CDSCO" | "State drug lab" | "State drug controller" | "WHO" | "Community" {
  if (source === "who") return "WHO"
  if (source.startsWith("state_dca")) return "State drug controller"
  if (source === "community") return "Community"
  if (source.includes("state")) return "State drug lab"
  return "CDSCO"
}

/** Manufacturer names start with noise like "M/s." and end in a long address; keep the first words. */
export function normMfr(s: string): string {
  return normProduct(s.replace(/^\s*m\/s\.?\s*/i, "")).split(" ").slice(0, 5).join(" ").slice(0, MAX_KEY).trimEnd()
}

export const PINCODE_RE = /^[1-9]\d{5}$/

export function isPincode(s: string): boolean {
  return PINCODE_RE.test(s)
}
