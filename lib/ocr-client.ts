// Browser-only: read a medicine label from a photo. Never imported by server code.
import { parseLabel } from "./label.ts"

const ANGLES = [0, -10, 10, -15, 15, -5, 5, -20, 20]

type Worker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>
let worker: Worker | undefined

async function getWorker() {
  if (worker) return worker
  const { createWorker } = await import("tesseract.js")
  worker = await createWorker("eng")
  return worker
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(url); res(i) }
    i.onerror = rej
    i.src = url
  })
}

function canvasFor(img: HTMLImageElement, angle: number) {
  const k = Math.min(1, 1500 / Math.max(img.width, img.height))
  const W = img.width * k, H = img.height * k, d = Math.ceil(Math.hypot(W, H))
  const c = document.createElement("canvas")
  c.width = c.height = d
  const x = c.getContext("2d")!
  x.fillStyle = "#fff"; x.fillRect(0, 0, d, d)
  x.translate(d / 2, d / 2); x.rotate((angle * Math.PI) / 180)
  x.filter = "grayscale(1) contrast(1.5)"
  x.drawImage(img, -W / 2, -H / 2, W, H)
  return c
}

export type LabelReading = { batch: string | null; product: string | null; via: "device" | "server" }

/**
 * Read a label. On the server's vision model when it has one; otherwise on the device with Tesseract,
 * trying a few small rotations (handheld photos are tilted) and stopping once two passes agree.
 * The result is only ever a suggestion: on a curved, tilted label digits get dropped or swapped.
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
  const w = await getWorker()
  let best = { score: -1, batch: null as string | null, product: null as string | null }
  const votes = new Map<string, number>()
  for (let i = 0; i < ANGLES.length; i++) {
    opts.onStatus?.("reading", i + 1, ANGLES.length)
    opts.onProgress?.((i / ANGLES.length) * 100)
    const r = await w.recognize(canvasFor(img, ANGLES[i]!))
    const lines = r.data.lines.map((l) => ({ text: l.text, h: l.bbox.y1 - l.bbox.y0, conf: l.confidence }))
    const cur = parseLabel(r.data.text, lines)
    if (cur.score > best.score) best = cur
    if (cur.batch) votes.set(cur.batch, (votes.get(cur.batch) ?? 0) + 1)
    if ([...votes.values()].some((n) => n >= 2)) break
  }
  opts.onProgress?.(100)
  // Most-agreed reading wins; ties go to the longer one (a dropped digit is the usual error).
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]
  return { batch: top ? top[0] : best.batch, product: best.product, via: "device" }
}
