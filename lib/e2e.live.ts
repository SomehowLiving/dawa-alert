// Live test against the Tiramisu testnet. Skipped unless PRIVATE_KEY is set and funded.
//   npm run test:live
// Writes a few entities tagged "zz dawa livetest" and deletes what it can afterwards.
import { describe, expect, it } from "vitest"
import { and, eq } from "@arkiv-network/sdk/query"
import { makePublicClient, makeWalletClient } from "./arkiv.ts"
import { checkBatch, recordSighting, searchAlerts, seedAlerts, sightingMap } from "./service.ts"
import { DEAD_ADDRESS, planAlert, type AlertRecord } from "./schema.ts"

// The API hides "ZZ Dawa LiveTest" records from users; this test has to see them.
const HIDDEN = { includeHidden: true } as const

const key = process.env.PRIVATE_KEY
const pub = makePublicClient(process.env.ARKIV_RPC)
const wallet = key && /^0x[0-9a-f]{64}$/i.test(key) ? makeWalletClient(key, process.env.ARKIV_RPC) : undefined
const funded = wallet ? (await pub.getBalance({ address: wallet.account.address })) > 0n : false

const stamp = Date.now().toString(36).toUpperCase()
const nextMonth = new Date(Date.now() + 40 * 86400_000) // expiry month: just far enough to be storable
const ym = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`
const nowD = new Date()
const thisMonth = `${nowD.getUTCFullYear()}-${String(nowD.getUTCMonth() + 1).padStart(2, "0")}` // list month: never in the future
const rec = (batch: string, over: Partial<AlertRecord> = {}): AlertRecord => ({
  source: "cdsco_portal_state_nsq",
  list_month: thisMonth,
  row: null,
  product: "ZZ Dawa LiveTest Syrup",
  batch,
  mfg_ym: "2026-01",
  expiry_ym: ym,
  manufacturer: "Synthetic Test Pharma",
  reason: "live test",
  lab: "none",
  doc: "live test",
  doc_sha256: null,
  doc_url: null,
  ...over,
})

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 40_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (ok(v) || Date.now() > end) return v
    await new Promise((r) => setTimeout(r, 2000))
  }
}

describe.skipIf(!funded)("Arkiv testnet end-to-end", () => {
  const locked = `LV${stamp}A`
  const open = `LV${stamp}B`
  let openKey: `0x${string}`
  let sightingKey: `0x${string}` | undefined

  it("writes an alert and locks it to the burn address", async () => {
    const report = await seedAlerts(pub, wallet!, [rec(locked)], { lock: true })
    expect(report.created).toBe(1)
    expect(report.locked).toBe(1)
  }, 90_000)

  it("finds it by batch, readonly, owned by the burn address", async () => {
    const v = await eventually(() => checkBatch(pub, { batch: locked, product: "ZZ Dawa LiveTest" }, HIDDEN), (x) => x.status === "flagged")
    expect(v.status).toBe("flagged")
    expect(v.matches[0]!.readonly).toBe(true)
    expect(v.matches[0]!.owner?.toLowerCase()).toBe(DEAD_ADDRESS.toLowerCase())
    expect(v.matches[0]!.authority).toBe("State drug lab")
  }, 60_000)

  it("cannot be deleted by the wallet that wrote it", async () => {
    const v = await checkBatch(pub, { batch: locked, product: "ZZ Dawa LiveTest" }, HIDDEN)
    await expect(wallet!.deleteEntity({ entityKey: v.matches[0]!.key })).rejects.toThrow()
  }, 60_000)

  it("an unlocked readonly alert still cannot be edited, even by its owner", async () => {
    const report = await seedAlerts(pub, wallet!, [rec(open)], { lock: false })
    expect(report.created).toBe(1)
    const v = await eventually(() => checkBatch(pub, { batch: open }, HIDDEN), (x) => x.matches.length > 0)
    openKey = v.matches[0]!.key
    expect(v.matches[0]!.owner?.toLowerCase()).toBe(wallet!.account.address.toLowerCase())
    await expect(
      wallet!.patchEntity({ entityKey: openKey, set: { severity: 1 } }),
    ).rejects.toThrow()
  }, 90_000)

  it("searches by product prefix", async () => {
    const r = await eventually(() => searchAlerts(pub, "zz dawa live", 25, "product", HIDDEN), (x) => x.length >= 2)
    expect(r.map((m) => m.batch)).toEqual(expect.arrayContaining([locked, open]))
  }, 60_000)

  it("seeding the same record again writes nothing", async () => {
    const report = await seedAlerts(pub, wallet!, [rec(open)], { lock: false })
    expect(report.created).toBe(0)
    expect(report.skippedDuplicate).toBe(1)
  }, 60_000)

  it("records a sighting, renews it on repeat, and maps it by district", async () => {
    const first = await recordSighting(pub, wallet!, { batch: open, pincode: "480001", reporterType: "chemist" })
    expect(first.status).toBe("created")
    sightingKey = first.entityKey
    const map = await eventually(() => sightingMap(pub, open), (m) => m.length > 0)
    expect(map).toEqual([{ pin3: 480, count: 1, batches: [expect.stringContaining(`LV${stamp}B`)] }])
    const again = await recordSighting(pub, wallet!, { batch: open, pincode: "480001", reporterType: "chemist" })
    expect(["renewed", "already_fresh"]).toContain(again.status)
    expect(again.entityKey).toBe(first.entityKey)
    const v = await checkBatch(pub, { batch: open }, HIDDEN)
    expect(v.sightings.count).toBe(1)
  }, 120_000)

  it("cleans up what it can", async () => {
    const del = [openKey, sightingKey].filter(Boolean) as `0x${string}`[]
    await wallet!.executeBatch({ deletes: del.map((entityKey) => ({ entityKey })) })
    const left = await pub
      .select({ key: true })
      .where(and(eq("app", "dawa-alert"), eq("batch_norm", open)))
      .fetch()
    expect(left.entities).toHaveLength(0)
  }, 60_000)
})

describe.skipIf(funded)("Arkiv testnet end-to-end (skipped)", () => {
  it("needs a funded PRIVATE_KEY: claim GLM at https://hub.arkiv.network/faucet", () => {
    expect(planAlert(rec("X1")).skip).toBeUndefined()
  })
})
