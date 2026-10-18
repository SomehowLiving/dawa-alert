import { describe, expect, it, vi } from "vitest"
import { makeGeminiOcr, makeOcr, parseLabelJson } from "./ocr.ts"

const PNG = "data:image/png;base64,iVBORw0KGgo="

describe("parseLabelJson", () => {
  it("reads a clean reply", () => expect(parseLabelJson('{"batch":"SR-13","product":"Coldrif"}')).toEqual({ batch: "SR-13", product: "Coldrif" }))
  it("tolerates prose around the JSON", () => expect(parseLabelJson('Sure! {"batch":"R01GL2523","product":null} done')).toEqual({ batch: "R01GL2523", product: null }))
  it("returns nulls for junk", () => expect(parseLabelJson("I cannot read it")).toEqual({ batch: null, product: null }))
  it("drops absurdly long values", () => expect(parseLabelJson(JSON.stringify({ batch: "x".repeat(500), product: "ok" }))).toEqual({ batch: null, product: "ok" }))
})

describe("makeOcr", () => {
  it("sends the image once and returns the parsed label", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '{"batch":"SR-13","product":"Coldrif"}' }] }), { status: 200 }))
    const out = await makeOcr("k", f as unknown as typeof fetch)(PNG)
    expect(out).toEqual({ batch: "SR-13", product: "Coldrif" })
    expect(f).toHaveBeenCalledOnce()
    const body = JSON.parse((f.mock.calls[0] as any)[1].body)
    expect(body.messages[0].content[0].source.media_type).toBe("image/png")
  })
  it("rejects anything that is not an image data URL", async () => {
    await expect(makeOcr("k", vi.fn() as any)("https://evil.test/x.png")).rejects.toThrow(/data URL/)
  })
  it("surfaces upstream failures", async () => {
    const f = vi.fn(async () => new Response("no", { status: 500 }))
    await expect(makeOcr("k", f as any)(PNG)).rejects.toThrow(/500/)
  })
})

describe("makeGeminiOcr", () => {
  const reply = (text: string) => vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }))

  it("sends the image once, keeps the key in a header, and parses the reply", async () => {
    const f = reply('{"batch":"SR-13","product":"Coldrif"}')
    const out = await makeGeminiOcr("secret-key", f as unknown as typeof fetch)(PNG)
    expect(out).toEqual({ batch: "SR-13", product: "Coldrif" })
    expect(f).toHaveBeenCalledOnce()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain("secret-key") // never in the URL, where it would end up in logs
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key")
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe("image/png")
    expect(body.generationConfig.temperature).toBe(0)
  })
  it("treats a null batch as unreadable, not an error", async () => {
    expect(await makeGeminiOcr("k", reply('{"batch":null,"product":"Dolo"}') as unknown as typeof fetch)(PNG)).toEqual({ batch: null, product: "Dolo" })
  })
  it("rejects anything that is not an image data URL", async () => {
    await expect(makeGeminiOcr("k", vi.fn() as never)("https://evil.test/x.png")).rejects.toThrow(/data URL/)
  })
  it("surfaces upstream failures without leaking the key", async () => {
    const f = vi.fn(async () => new Response("quota", { status: 429 }))
    await expect(makeGeminiOcr("secret-key", f as never)(PNG)).rejects.toThrow(/429/)
    await expect(makeGeminiOcr("secret-key", f as never)(PNG)).rejects.not.toThrow(/secret-key/)
  })
})
