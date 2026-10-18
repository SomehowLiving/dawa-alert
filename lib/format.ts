const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-08" -> "Aug 2026". */
export function fmtYm(ym?: string | null, fallback = "unknown") {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || "")
  return m ? `${MON[+m[2]! - 1]} ${m[1]}` : ym || fallback
}

/** "2026-08" -> "08/2026" (how a pack prints it). */
export function fmtMmYyyy(ym?: string | null, fallback = "unknown") {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || "")
  return m ? `${m[2]}/${m[1]}` : fallback
}

export function shortKey(k?: string) {
  return k ? `${k.slice(0, 8)}…${k.slice(-6)}` : "—"
}

export const batchHref = (m: { batch: string; product: string }) =>
  `/batch?batch=${encodeURIComponent(m.batch)}&product=${encodeURIComponent(m.product)}`

export const EXPLORER_URL = "https://data.arkiv.network"

/**
 * Where to look at an Arkiv entity by key. The data explorer reads `?q=<key>` and runs the lookup by itself, showing the
 * owner, attributes, payload and expiry. A malformed key falls back to the explorer home rather than building an odd URL.
 */
export const entityUrl = (key: string) => (/^0x[0-9a-fA-F]{64}$/.test(key) ? `${EXPLORER_URL}/?q=${key}` : EXPLORER_URL)
