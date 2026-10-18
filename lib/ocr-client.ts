// Browser-only: read a medicine label from a photo. Never imported by server code.
//
// Engines, best first:
//   1. the server's vision model, when one is configured (/api/ocr)
//   2. PaddleOCR (PP-OCRv5 on onnxruntime-web), run on the device: far better than Tesseract on skewed, curved text.
//      Models are self-hosted under /ocr (see scripts/fetch-ocr-models.mjs) because Baidu's bucket sends no CORS header.
//   3. Tesseract.js, if PaddleOCR cannot start (old browser, models missing)
import { parseLabel, type OcrLine } from "./label.ts"

const ANGLES = [0, -10, 10, -15, 15, -5, 5, -20, 20]
const PADDLE_ANGLES = [0, -15, 15] // PaddleOCR reads most photos upright; a label it cannot read is better handed to the AI button than retried five times
const ORT_VERSION = "1.30.0" // must match the installed onnxruntime-web
const MODELS = {
  det: { name: "PP-OCRv5_mobile_det", url: "/ocr/PP-OCRv5_mobile_det_onnx_infer.tar" },
  rec: { name: "PP-OCRv5_mobile_rec", url: "/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar" },
}

type Engine = { name: "paddle" | "tesseract"; read(canvas: HTMLCanvasElement): Promise<{ text: string; lines: OcrLine[] }> }

/* ---------- PaddleOCR ---------- */
type PaddleItem = { poly: number[][] | number[]; text: string; score: number }
type PaddleOcr = { predict(input: HTMLCanvasElement): Promise<{ items: PaddleItem[] }[]> }
let paddle: Promise<Engine | null> | undefined

function polyHeight(poly: PaddleItem["poly"]): number {
  const ys = Array.isArray(poly[0]) ? (poly as number[][]).map((p) => p[1]!) : (poly as number[]).filter((_, i) => i % 2 === 1)
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0
}

function getPaddle(): Promise<Engine | null> {
  paddle ??= (async () => {
    try {
      const { PaddleOCR } = await import("@paddleocr/paddleocr-js")
      const ocr = (await PaddleOCR.create({
        textDetectionModelName: MODELS.det.name,
        textDetectionModelAsset: { url: MODELS.det.url },
        textRecognitionModelName: MODELS.rec.name,
        textRecognitionModelAsset: { url: MODELS.rec.url },
        ortOptions: { backend: "wasm", numThreads: 1, wasmPaths: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/` },
      } as never)) as unknown as PaddleOcr
      ;(globalThis as { __paddleOcr?: unknown }).__paddleOcr = ocr // handy for tuning in the console
      return {
        name: "paddle" as const,
        async read(canvas) {
          const [r] = await ocr.predict(canvas)
          const items = r?.items ?? []
          const lines = items.map((i) => ({ text: i.text, h: polyHeight(i.poly), conf: i.score * 100 }))
          return { text: items.map((i) => i.text).join("\n"), lines }
        },
      }
    } catch (err) {
      console.warn("PaddleOCR unavailable, falling back to Tesseract:", err)
      return null
    }
  })()
  return paddle
}

/* ---------- Tesseract (fallback) ---------- */
type TessWorker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
let tess: Promise<TessWorker> | undefined

function getTesseract(): Promise<Engine> {
  tess ??= import("tesseract.js").then(({ createWorker }) => createWorker("eng"))
  return tess.then((w) => ({
    name: "tesseract" as const,
    async read(canvas) {
      const r = await w.recognize(canvas)
      return { text: r.data.text, lines: r.data.lines.map((l) => ({ text: l.text, h: l.bbox.y1 - l.bbox.y0, conf: l.confidence })) }
    },
  }))
}

/* ---------- image helpers ---------- */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = rej
    i.src = url
  })
}

function canvasFor(img: HTMLImageElement, angle: number, enhance: boolean) {
  const k = Math.min(1, 1600 / Math.max(img.width, img.height))
  const W = img.width * k, H = img.height * k, d = Math.ceil(Math.hypot(W, H))
  const c = document.createElement("canvas")
  c.width = c.height = angle === 0 ? Math.ceil(Math.max(W, H)) : d
  const x = c.getContext("2d")!
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height)
  x.translate(c.width / 2, c.height / 2); x.rotate((angle * Math.PI) / 180)
  if (enhance) x.filter = "grayscale(1) contrast(1.5)"
  x.drawImage(img, -W / 2, -H / 2, W, H)
  return c
}

export type LabelReading = { batch: string | null; product: string | null; via: "device" | "server" }

/**
 * Read a label. The result is only ever a suggestion: on a curved, tilted label digits get dropped or swapped.
 * Tries a few small rotations (handheld photos are tilted) and stops once two passes agree on a batch.
 */
export async function readLabel(
  file: File,
  opts: { server?: boolean; onStatus?: (key: "loading" | "reading", i?: number, n?: number) => void; onProgress?: (pct: number) => void } = {},
): Promise<LabelReading> {
  if (opts.server) {
    const image = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const out = await fetch("/api/ocr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) })
    const j = await out.json()
    if (!out.ok) throw new Error(j.error || "could not read the photo")
    return { batch: j.batch, product: j.product, via: "server" }
  }

  opts.onStatus?.("loading")
  const img = await loadImage(file)
  const engine = (await getPaddle()) ?? (await getTesseract())
  const enhance = engine.name === "tesseract" // PaddleOCR does its own normalisation; contrast filters only hurt it
  const angles = engine.name === "paddle" ? PADDLE_ANGLES : ANGLES
  const agree = engine.name === "paddle" ? 1 : 2 // PaddleOCR is accurate enough to trust a first hit; Tesseract needs two
  let best = { score: -1, batch: null as string | null, product: null as string | null }
  const votes = new Map<string, number>()
  for (let i = 0; i < angles.length; i++) {
    opts.onStatus?.("reading", i + 1, angles.length)
    opts.onProgress?.((i / angles.length) * 100)
    const { text, lines } = await engine.read(canvasFor(img, angles[i]!, enhance))
    const cur = parseLabel(text, lines)
    ;(globalThis as { __lastOcr?: unknown }).__lastOcr = { engine: engine.name, angle: angles[i], text, cur }
    if (cur.score > best.score) best = cur
    if (cur.batch) votes.set(cur.batch, (votes.get(cur.batch) ?? 0) + 1)
    if ([...votes.values()].some((n) => n >= agree)) break
  }
  opts.onProgress?.(100)
  // Most-agreed reading wins; ties go to the longer one (a dropped digit is the usual error).
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]
  return { batch: top ? top[0] : best.batch, product: best.product, via: "device" }
}
