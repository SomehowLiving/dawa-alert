# Photo reading

 "Scan the batch number" works out of the box and runs *on the device*, so the photo never leaves the phone:
[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (PP-OCRv5 on onnxruntime-web, via the official
[`@paddleocr/paddleocr-js`](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html) SDK),
with [Tesseract.js](https://github.com/naptha/tesseract.js) as a fallback if it cannot start. The two models (~21 MB) are
downloaded by `scripts/fetch-ocr-models.mjs` before `dev`/`build` and served from `/ocr`, because the model bucket sends no CORS
header. PaddleOCR returns "Batch No." and its value as separate boxes, so `lib/label.ts` reads a keyword's value from the next
line, and refuses dates as batch values. On our test bottle it reads `A1254` exactly (Tesseract read `A12`), and on synthetic
labels (one-line, 12° tilt, noisy foil strip, "LOT" style) it read all four; a label with no batch returns nothing.
It is still only ever a **suggestion**: the guess is shown next to the photo with a "Use this batch" button and a warning,
and never fills the field by itself.

## Optional AI reading

 Set `GEMINI_API_KEY` (model `gemini-2.5-flash`, override with `GEMINI_MODEL`) or `ANTHROPIC_API_KEY` and the
scan card gains a **"Try AI reading"** button. It is opt-in per photo: the device always reads first, and only if the person clicks does
that one photo go to the server's vision model (not stored). On our test set both readers got 8 of 8 batch numbers right, including a
25° tilted, blurred, glared label and a perspective-warped one; Gemini takes ~2.5 s with no model download, PaddleOCR 5–14 s but
never sends the photo anywhere. Gemini "corrects" unusual product spellings, which is another reason the batch is only ever a suggestion.
