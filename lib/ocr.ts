// Optional: read a medicine label from a photo with Claude vision. Disabled unless ANTHROPIC_API_KEY is set.
// The image is forwarded once and never stored; only the extracted batch and product leave this function.

export type LabelReading = { batch: string | null; product: string | null }

const PROMPT =
  'This is a photo of a medicine strip, bottle or carton. Reply with ONLY a JSON object ' +
  '{"batch": string|null, "product": string|null}. "batch" is the value printed after "B.No.", "Batch No.", "Batch" or "Lot". ' +
  '"product" is the brand name. Use null if you cannot read it. Never guess.'

export function parseLabelJson(text: string): LabelReading {
  const m = /\{[\s\S]*\}/.exec(text)
  if (!m) return { batch: null, product: null }
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    const clean = (v: unknown) => (typeof v === "string" && v.trim() && v.length < 120 ? v.trim() : null)
    return { batch: clean(j.batch), product: clean(j.product) }
  } catch {
    return { batch: null, product: null }
  }
}

export function makeOcr(apiKey: string, fetchImpl: typeof fetch = fetch, model = "claude-sonnet-5-5") {
  return async (dataUrl: string): Promise<LabelReading> => {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) throw new Error("expected a base64 image data URL (jpeg, png, webp or gif)")
    if (m[2]!.length > 7_000_000) throw new Error("image too large")
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`vision API ${res.status}`)
    const body = (await res.json()) as { content?: { type: string; text?: string }[] }
    return parseLabelJson(body.content?.find((c) => c.type === "text")?.text ?? "")
  }
}
