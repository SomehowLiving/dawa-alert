import { describe, expect, it, vi } from "vitest"
import { makeOcr, parseLabelJson } from "./ocr.ts"

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
