// Turn OCR output from a medicine label into a suggested batch number and product name.
// Pure functions, no DOM: unit-tested in tests/unit/label.test.ts.

const KEY = String.raw`(?:b\s*\.?\s*no|batch\s*(?:no|number|num|#)?|lot\s*(?:no|number|#)?)`
const BATCH_RE = new RegExp(String.raw`\b${KEY}\b\s*[.,:;\-#\s]*([A-Z0-9][A-Z0-9\-\/]{1,19})`, "i")
const NOT_BATCH = /^(mfg|mfd|exp|date|no|dt|price|mrp|each|ml|mg|use|by)$/i
const LABEL_WORDS = /\b(batch|b\.?\s*no|lot|mfg|mfd|manufactur|exp|expiry|date|mrp|price|each|contains|store|keep|dosage|use|schedule|rx|only|ip|bp|usp)\b/i

const KEY_ONLY = new RegExp(String.raw`^\s*${KEY}\s*[.,:;\-#]*\s*$`, "i")
const DATE_LIKE = /^\d{1,2}[/\-.]\d{2,4}$|^\d{4}$/ // an expiry or manufacturing date is never the batch

const clean = (tok: string) => tok.replace(/[\-\/]+$/, "")
const plausible = (tok: string) => tok.length >= 2 && /\d/.test(tok) && !NOT_BATCH.test(tok) && !DATE_LIKE.test(tok)

/** Best batch token in a block of OCR text, or null. A batch number almost always contains a digit.
 *  Readers differ: Tesseract returns "Batch No. A1254" as one line, PaddleOCR as two boxes ("Batch No." then
 *  "A1254"), so a keyword alone on a line takes its value from the next line. */
export function findBatch(text: string): string | null {
  const lines = String(text).split(/\n+/)
  for (let i = 0; i < lines.length; i++) {
    const m = BATCH_RE.exec(lines[i]!)
    if (m) {
      const tok = clean(m[1]!)
      if (plausible(tok)) return tok.toUpperCase()
    }
    if (KEY_ONLY.test(lines[i]!)) {
      const next = /^\s*[.,:;\-#]*\s*([A-Z0-9][A-Z0-9\-\/]{1,19})\b/i.exec(lines[i + 1] ?? "")
      const tok = next ? clean(next[1]!) : ""
      if (tok && plausible(tok)) return tok.toUpperCase()
    }
  }
  return null
}

export const MIN_PRODUCT_CONF = 80

/** The most prominent name-like line: tallest text line that is mostly letters and not a label word.
 *  Lines the reader was not confident about are ignored: a junk product name is worse than none. */
export type OcrLine = { text: string; h: number; conf?: number }
export function findProduct(lines: OcrLine[] | undefined): string | null {
  let best: { text: string; h: number } | null = null
  for (const l of lines ?? []) {
    if ((l.conf ?? 100) < MIN_PRODUCT_CONF) continue
    const t = String(l.text ?? "").trim()
    const letters = (t.match(/[A-Za-z]/g) || []).length
    if (t.length < 3 || t.length > 32 || letters < 3 || letters / t.replace(/\s/g, "").length < 0.5 || LABEL_WORDS.test(t)) continue
    if (!best || l.h > best.h) best = { text: t.replace(/[^A-Za-z0-9 &\-]/g, "").trim(), h: l.h }
  }
  return best && best.text.length >= 3 ? best.text : null
}

/** Score a reading so several rotated attempts can be compared: a batch beside its keyword is worth most. */
export function scoreReading(r: { batch: string | null; product: string | null }): number {
  return (r.batch ? 10 + Math.min(r.batch.length, 10) : 0) + (r.product ? 2 : 0)
}

export function parseLabel(text: string, lines: OcrLine[]) {
  const r = { batch: findBatch(text), product: findProduct(lines) }
  return { ...r, score: scoreReading(r) }
}
