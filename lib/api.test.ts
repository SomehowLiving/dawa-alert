import { describe, expect, it, vi } from "vitest"
import { createApi } from "./api.ts"
import type { WalletClient } from "./arkiv.ts"
import { fake, type Row } from "./fakeClient.ts"

const rows: Row[] = [
  { kind: "alert", batch_norm: "LV1", authority: "State drug lab", severity: 1, product: "ZZ Dawa LiveTest Syrup", batch: "LV1" },
  { kind: "alert", batch_norm: "SR13", authority: "WHO", severity: 3, product: "COLDRIF", batch: "SR-13" },
  { kind: "alert", batch_norm: "SR13", authority: "CDSCO", severity: 3, product: "Coldrif Syrup", batch: "SR-13" },
  { kind: "sighting", batch_norm: "SR13", pin3: 480 },
]

function wallet() {
  const createEntity = vi.fn(async () => ({ entityKey: "0xabc" as const, txHash: "0xdef" as const }))
  const extendEntity = vi.fn(async () => ({ txHash: "0x1" as const }))
  return { w: { account: { address: "0x1111111111111111111111111111111111111111" }, createEntity, extendEntity } as unknown as WalletClient, createEntity, extendEntity }
}

const post = (app: ReturnType<typeof createApi>, body: unknown, ip = "1.1.1.1") =>
  app.request("/api/sightings", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } })

describe("GET /api/check", () => {
  const app = createApi({ pub: fake(rows) })
  it("returns a flagged verdict with both authorities", async () => {
    const r = await app.request("/api/check?batch=SR-13&product=Coldrif")
    expect(r.status).toBe(200)
    const j = (await r.json()) as any
    expect(j.status).toBe("flagged")
    expect(j.authorities.sort()).toEqual(["CDSCO", "WHO"])
    expect(j.sightings.count).toBe(1)
  })
  it("400s without a batch", async () => {
    const r = await app.request("/api/check")
    expect(r.status).toBe(400)
  })
  it("never says safe", async () => {
    const j = (await (await app.request("/api/check?batch=NOPE1")).json()) as any
    expect(j.status).toBe("not_found")
    expect(JSON.stringify(j)).not.toMatch(/"safe"/)
  })
})

describe("POST /api/sightings", () => {
  const good = { batch: "SR-13", pincode: "480001", reporterType: "chemist" }

  it("creates a sighting through the relay wallet", async () => {
    const { w, createEntity } = wallet()
    const app = createApi({ pub: fake([]), wallet: w })
    const r = await post(app, good)
    expect(r.status).toBe(201)
    expect(createEntity).toHaveBeenCalledOnce()
    const arg = (createEntity.mock.calls[0] as any)[0]
    expect(arg.flags.readonly).toBe(true)
    expect(arg.attributes.pincode.value).toBe(480001)
  })
  it("rejects invalid input with 400 and writes nothing", async () => {
    const { w, createEntity } = wallet()
    const app = createApi({ pub: fake([]), wallet: w })
    expect((await post(app, { ...good, pincode: "x" })).status).toBe(400)
    expect(createEntity).not.toHaveBeenCalled()
  })
  it("503s on a read-only deployment", async () => {
    expect((await post(createApi({ pub: fake([]) }), good)).status).toBe(503)
  })
  it("rate-limits per address", async () => {
    const { w } = wallet()
    const app = createApi({ pub: fake([]), wallet: w, ratePerHour: 2 })
    expect((await post(app, good, "9.9.9.9")).status).toBe(201)
    expect((await post(app, good, "9.9.9.9")).status).toBe(201)
    expect((await post(app, good, "9.9.9.9")).status).toBe(429)
    expect((await post(app, good, "8.8.8.8")).status).toBe(201)
  })
})

describe("GET /api/health", () => {
  it("reports chain and relay balance", async () => {
    const { w } = wallet()
    const j = (await (await createApi({ pub: fake([]), wallet: w }).request("/api/health")).json()) as any
    expect(j.chainId).toBe(7738577)
    expect(j.relay.balanceGLM).toBe("1")
  })
})

describe("GET /api/sightings/map", () => {
  it("groups by district prefix", async () => {
    const app = createApi({ pub: fake(rows) })
    const j = (await (await app.request("/api/sightings/map?batch=SR13")).json()) as any
    expect(j.districts).toEqual([{ pin3: 480, count: 1, batches: ["SR13"] }])
  })
})

describe("GET /api/alerts and /api/recent", () => {
  const app = createApi({ pub: fake(rows) })
  it("searches by manufacturer as well as product", async () => {
    const j = (await (await app.request("/api/alerts?q=sresan&by=manufacturer")).json()) as any
    expect(j.by).toBe("manufacturer")
    expect(Array.isArray(j.results)).toBe(true)
  })
  it("ignores an unknown search mode instead of failing", async () => {
    const j = (await (await app.request("/api/alerts?q=cold&by=weird")).json()) as any
    expect(j.by).toBe("product")
  })
  it("serves a recent feed", async () => {
    const r = await app.request("/api/recent")
    expect(r.status).toBe(200)
    expect(((await r.json()) as any).results.length).toBeGreaterThan(0)
  })
})

describe("read caching (the access key has a query budget)", () => {
  it("answers an identical check from cache, but refreshes after a sighting is reported", async () => {
    let selects = 0
    const base = fake(rows)
    const counting = new Proxy(base, { get: (t, k, r) => (k === "select" ? (...a: unknown[]) => { selects++; return (t as any).select(...a) } : Reflect.get(t, k, r)) }) as typeof base
    const { w } = wallet()
    const app = createApi({ pub: counting, wallet: w })
    await app.request("/api/check?batch=SR-13&product=Coldrif")
    const afterFirst = selects
    await app.request("/api/check?batch=sr 13&product=coldrif") // same normalised key
    expect(selects).toBe(afterFirst)
    await post(app, { batch: "SR-13", pincode: "480001", reporterType: "chemist" })
    await app.request("/api/check?batch=SR-13&product=Coldrif")
    expect(selects).toBeGreaterThan(afterFirst)
  })
  it("does not cache failures", async () => {
    let fail = true
    const pub = fake(rows)
    const flaky = new Proxy(pub, { get: (t, k, r) => (k === "select" ? (...a: unknown[]) => { if (fail) throw new Error("rate limited"); return (t as any).select(...a) } : Reflect.get(t, k, r)) }) as typeof pub
    const app = createApi({ pub: flaky })
    expect((await app.request("/api/check?batch=SR-13")).status).toBe(502)
    fail = false
    expect((await app.request("/api/check?batch=SR-13")).status).toBe(200)
  })
})

describe("test records are never shown", () => {
  it("hides the live test's leftover alert from the recent feed and from search", async () => {
    const app = createApi({ pub: fake(rows) })
    const recent = ((await (await app.request("/api/recent")).json()) as any).results
    const search = ((await (await app.request("/api/alerts?q=zz dawa")).json()) as any).results
    expect(recent.map((m: any) => m.product)).not.toContain("ZZ Dawa LiveTest Syrup")
    expect(search.map((m: any) => m.product)).not.toContain("ZZ Dawa LiveTest Syrup")
  })
})

describe("GET /api/browse", () => {
  const app = createApi({ pub: fake(rows) })
  it("returns a page of alerts with a next cursor field", async () => {
    const j = (await (await app.request("/api/browse?severity=3")).json()) as any
    expect(Array.isArray(j.results)).toBe(true)
    expect(j).toHaveProperty("next")
    expect(j.capped).toBe(false)
    expect(j.results.map((m: any) => m.product)).not.toContain("ZZ Dawa LiveTest Syrup")
  })
  it("pages through every alert with an offset cursor", async () => {
    const many: Row[] = Array.from({ length: 95 }, (_, i) => ({ kind: "alert", batch_norm: `B${i}`, authority: "CDSCO", severity: 1, product: `Drug ${i}`, batch: `B${i}`, src: "cdsco_portal_nsq", list_ym: 202601 }))
    const a = createApi({ pub: fake(many) })
    const seen: string[] = []
    let cursor = ""
    for (let i = 0; i < 5; i++) {
      const j = (await (await a.request(`/api/browse${cursor ? `?cursor=${cursor}` : ""}`)).json()) as any
      seen.push(...j.results.map((m: any) => m.batch))
      if (!j.next) break
      cursor = j.next
    }
    expect(new Set(seen).size).toBe(95)
  })
  it.each(["severity=9", "authority=Nobody", "month=2026-13", "month=Aug-2026"])("rejects %s", async (q) => {
    expect((await app.request(`/api/browse?${q}`)).status).toBe(400)
  })
})

describe("legacy PDF-import records are hidden", () => {
  const legacy: Row = { kind: "alert", batch_norm: "CAL1", authority: "State drug lab", severity: 1, product: "Calc ium and Vitamin D3", batch: "CAL1", src: "cdsco_state_nsq" }
  const clean: Row = { kind: "alert", batch_norm: "CAL1", authority: "State drug lab", severity: 1, product: "Calcium and Vitamin D3", batch: "CAL1", src: "cdsco_portal_state_nsq" }
  const spurious: Row = { kind: "alert", batch_norm: "TEL1", authority: "CDSCO", severity: 2, product: "Telma H", batch: "TEL1", src: "cdsco_spurious" }
  it("shows only the clean duplicate, so the count is not doubled", async () => {
    const app = createApi({ pub: fake([legacy, clean]) })
    const v = (await (await app.request("/api/check?batch=CAL1&product=Calcium")).json()) as any
    expect(v.matches).toHaveLength(1)
    expect(v.matches[0].product).toBe("Calcium and Vitamin D3")
  })
  it("keeps the genuine spurious-list records from the same import", async () => {
    const v = (await (await createApi({ pub: fake([spurious]) }).request("/api/check?batch=TEL1&product=Telma")).json()) as any
    expect(v.status).toBe("flagged")
  })
  it("hides them from browse too", async () => {
    const j = (await (await createApi({ pub: fake([legacy, clean]) }).request("/api/browse")).json()) as any
    expect(j.results.map((m: any) => m.product)).toEqual(["Calcium and Vitamin D3"])
  })
})

describe("stale-while-revalidate", () => {
  it("serves stats from the old value while one background refresh runs", async () => {
    let selects = 0
    const base = fake(rows)
    const counting = new Proxy(base, { get: (t, k, r) => (k === "select" ? (...a: unknown[]) => { selects++; return (t as any).select(...a) } : Reflect.get(t, k, r)) }) as typeof base
    let clock = 1_000_000
    const app = createApi({ pub: counting, now: () => clock })
    const first = (await (await app.request("/api/stats")).json()) as any
    const afterFirst = selects
    clock += 6 * 60_000 // past the 5 minute freshness window
    const second = (await (await app.request("/api/stats")).json()) as any
    expect(typeof first.alerts).toBe("number") // a real answer, not an error body
    expect(second.alerts).toBe(first.alerts) // answered immediately from the stale value
    await new Promise((r) => setTimeout(r, 20)) // let the background refresh finish
    expect(selects).toBeGreaterThan(afterFirst) // ...and a refresh really ran
    const third = await app.request("/api/stats")
    expect(third.status).toBe(200)
  })
})

describe("stats snapshot", () => {
  const snap = { alerts: 2336, sightings: 0, byAuthority: { WHO: 3 }, bySeverity: { "1": 2281, "2": 31, "3": 24 }, byMonth: [{ ym: "2026-08", n: 212 }], indexedThrough: "2026-08", asOf: "2026-10-18T12:00:00.000Z" }

  it("reads the published snapshot instead of walking every alert", async () => {
    let selects = 0
    const base = fake([{ kind: "stats", batch_norm: "", payload: snap } as Row, ...rows])
    const counting = new Proxy(base, { get: (t, k, r) => (k === "select" ? (...a: unknown[]) => { selects++; return (t as any).select(...a) } : Reflect.get(t, k, r)) }) as typeof base
    const j = (await (await createApi({ pub: counting }).request("/api/stats")).json()) as any
    expect(j.alerts).toBe(2336)
    expect(j.byMonth).toEqual(snap.byMonth)
    expect(selects).toBeLessThanOrEqual(3) // one snapshot read + one sightings count, never a full walk
  })

  it("keeps sightings live even when the snapshot is older", async () => {
    const sightingsNow: Row[] = [{ kind: "sighting", batch_norm: "SR13", pin3: 480 }, { kind: "sighting", batch_norm: "SR13", pin3: 481 }]
    const j = (await (await createApi({ pub: fake([{ kind: "stats", batch_norm: "", payload: snap } as Row, ...sightingsNow]) }).request("/api/stats")).json()) as any
    expect(j.sightings).toBe(2)
  })

  it("falls back to live counting when no snapshot exists", async () => {
    const j = (await (await createApi({ pub: fake(rows) }).request("/api/stats")).json()) as any
    expect(typeof j.alerts).toBe("number")
    expect(j.alerts).toBeGreaterThan(0)
  })
})
