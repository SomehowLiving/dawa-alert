// Download the PaddleOCR models the browser reader needs into public/ocr/.
// Baidu's bucket sends no CORS header, so the browser cannot fetch them from there: we serve them ourselves.
// (PP-OCR models are Apache-2.0.) Runs before `dev` and `build`; skips files that are already there.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"

const BASE = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0"
const FILES = [
  ["PP-OCRv5_mobile_det_onnx_infer.tar", 4_843_520],
  ["PP-OCRv5_mobile_rec_onnx_infer.tar", 16_701_440],
]

mkdirSync("public/ocr", { recursive: true })
for (const [name, size] of FILES) {
  const path = `public/ocr/${name}`
  if (existsSync(path) && statSync(path).size === size) continue
  process.stdout.write(`fetching ${name} (${(size / 1e6).toFixed(1)} MB)… `)
  const res = await fetch(`${BASE}/${name}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length !== size) throw new Error(`${name}: expected ${size} bytes, got ${buf.length}`)
  writeFileSync(path, buf)
  console.log("ok")
}
