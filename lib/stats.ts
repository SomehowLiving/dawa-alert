// Dashboard numbers. Walking every alert is slow (the node caps cursor depth), so `publishStats` writes the
// result as one small Arkiv entity and the API reads that instead; live computation is only the fallback.
import { jsonToPayload, ExpirationTime } from "@arkiv-network/sdk/utils"
import { and, eq } from "@arkiv-network/sdk/query"
import type { PublicClient, WalletClient } from "./arkiv.ts"
import { APP, LEGACY_SOURCES, SCHEMA_VERSION } from "./schema.ts"
import { collectAlerts, isTestRecord } from "./service.ts"
import type { Stats } from "./types.ts"
import { i32 } from "@arkiv-network/sdk/attr"

const attr = (e: any, n: string) => e.attributes?.[n]?.value
const fmtYm = (ym: number) => `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`
export const SNAPSHOT_DAYS = 3

export async function countSightings(pub: PublicClient): Promise<number> {
  let n = 0
  for await (const _ of pub.select({ key: true }).where(and(eq("app", APP), eq("kind", "sighting")))) n++
  return n
}

/** Walk every live alert. Slow (tens of seconds); prefer the snapshot. */
export async function computeStats(pub: PublicClient, nowMs: number): Promise<Stats> {
  const all = await collectAlerts(pub, { attributes: { authority: true, severity: true, list_ym: true, product_norm: true, source: true } }, new Date(nowMs))
  // The live test writes locked, undeletable "ZZ Dawa LiveTest" alerts, and an early PDF import left
  // duplicates; neither counts as data.
  const rows = all.filter((e) => !isTestRecord(String(attr(e, "product_norm"))) && !LEGACY_SOURCES.has(String(attr(e, "source"))))
  const d = new Date(nowMs)
  const thisMonth = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1
  const byAuthority: Record<string, number> = {}
  const bySeverity: Record<string, number> = { "1": 0, "2": 0, "3": 0 }
  const months = new Map<number, number>()
  let latest = 0
  for (const e of rows) {
    const ym = Number(attr(e, "list_ym")) || 0
    if (ym && ym <= thisMonth) { // a list cannot be published in the future
      latest = Math.max(latest, ym)
      months.set(ym, (months.get(ym) ?? 0) + 1)
    }
    byAuthority[String(attr(e, "authority"))] = (byAuthority[String(attr(e, "authority"))] ?? 0) + 1
    bySeverity[String(attr(e, "severity"))] = (bySeverity[String(attr(e, "severity"))] ?? 0) + 1
  }
  return {
    alerts: rows.length,
    sightings: await countSightings(pub),
    byAuthority,
    bySeverity,
    byMonth: [...months.entries()].sort((a, b) => a[0] - b[0]).slice(-14).map(([ym, n]) => ({ ym: fmtYm(ym), n })),
    indexedThrough: latest ? fmtYm(latest) : null,
    asOf: new Date(nowMs).toISOString(),
  }
}

/** The newest published snapshot, or null. */
export async function readStatsSnapshot(pub: PublicClient): Promise<Stats | null> {
  const res = await pub
    .select({ payload: true, attributes: { asof: true } })
    .where(and(eq("app", APP), eq("kind", "stats")))
    .limit(20)
    .fetch()
  let best: Stats | null = null
  for (const e of res.entities) {
    try {
      const s = (e as any).toJson() as Stats
      if (!best || s.asOf > best.asOf) best = s
    } catch { /* ignore a malformed snapshot */ }
  }
  return best
}

/** Write the numbers as one entity that expires in a few days; the next sync replaces it. */
export async function publishStats(wallet: WalletClient, stats: Stats) {
  return wallet.createEntity({
    attributes: { app: APP, kind: "stats", v: i32(SCHEMA_VERSION), asof: stats.asOf },
    payload: jsonToPayload(stats),
    contentType: "application/json",
    expires: ExpirationTime.fromDays(SNAPSHOT_DAYS),
  })
}
