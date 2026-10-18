// Reads and writes against Arkiv. The server is a thin relay over this module.
import { and, eq, gte, lte, QueryError, startsWith } from "@arkiv-network/sdk/query"
import type { Hex } from "viem"
import type { PublicClient, WalletClient } from "./arkiv.ts"
import {
  authorityOf,
  isPincode,
  normBatch,
  normMfr,
  normProduct,
  productKey,
  productSimilarity,
} from "./normalize.ts"
import {
  APP,
  buildSightingEntity,
  DEAD_ADDRESS,
  LEGACY_SOURCES,
  planAlert,
  REPORTER_TYPES,
  SIGHTING_DAYS,
  ymd,
  type AlertPlan,
  type AlertRecord,
  type ReporterType,
} from "./schema.ts"
import { ExpirationTime } from "@arkiv-network/sdk/utils"

type Planned = Extract<AlertPlan, { create: unknown }>

/** The live test leaves locked, undeletable "ZZ Dawa LiveTest" alerts on chain; never show them to users. */
export const isTestRecord = (product: string) => normProduct(product).startsWith("zz dawa livetest")
/** Records the API never shows: the live test's leftovers and the legacy PDF import. */
export const isHidden = (m: { product: string; source: string }) => isTestRecord(m.product) || LEGACY_SOURCES.has(m.source)

const MATCH_THRESHOLD = 0.5
const PAGE = 200

export type { Match, Verdict } from "./types.ts"
import type { Match, Verdict } from "./types.ts"

const NOT_A_GUARANTEE =
  "Not found means this batch is not on any list we mirror. It is not proof that the medicine is safe."

/** Read an attribute's value whatever its tag. */
function attr(e: { attributes?: Record<string, { value: unknown }> | undefined }, name: string): unknown {
  return (e.attributes as Record<string, { value: unknown }> | undefined)?.[name]?.value
}

function toMatch(e: any, product: string | null): Match {
  const p = e.toJson() as any
  return {
    key: e.key,
    owner: e.owner,
    authority: String(attr(e, "authority") ?? authorityOf(String(attr(e, "source") ?? ""))),
    source: String(attr(e, "source") ?? ""),
    severity: Number(attr(e, "severity") ?? 1),
    product: p.product,
    batch: p.batch,
    mfgYm: p.mfg_ym ?? null,
    expiryYm: p.expiry_ym ?? null,
    manufacturer: p.manufacturer ?? "",
    reason: p.reason ?? "",
    lab: p.lab ?? "",
    listMonth: p.list_month ?? null,
    proof: p.proof ?? { doc: "", sha256: null, url: null, row: null },
    expiresAtBlock: e.expiresAt?.toString(),
    similarity: product ? productSimilarity(product, p.product) : 1,
    readonly: Boolean(e.creationFlags?.readonly),
  }
}

export async function checkBatch(
  client: PublicClient,
  input: { batch: string; product?: string | null },
  opts: { includeHidden?: boolean } = {},
): Promise<Verdict> {
  const batchNorm = normBatch(input.batch)
  if (!batchNorm) throw new BadRequest("batch is required")
  const product = input.product?.trim() ? input.product.trim() : null

  const res = await client
    .select({ key: true, owner: true, attributes: true, payload: true, expiresAt: true, creationFlags: true })
    .where(and(eq("app", APP), eq("kind", "alert"), eq("batch_norm", batchNorm)))
    .limit(PAGE)
    .fetch()
  const all = res.entities.map((e) => toMatch(e, product)).filter((m) => opts.includeHidden || !isHidden(m)).sort((a, b) => b.severity - a.severity)

  const sightings = await sightingSummary(client, batchNorm)

  if (all.length === 0) {
    return { query: { batch: input.batch, product }, status: "not_found", severity: 0, authorities: [], matches: [], otherProducts: [], sightings, note: NOT_A_GUARANTEE }
  }

  let matches: Match[]
  let otherProducts: Match[] = []
  let status: Verdict["status"]
  if (product) {
    matches = all.filter((m) => m.similarity >= MATCH_THRESHOLD)
    otherProducts = all.filter((m) => m.similarity < MATCH_THRESHOLD)
    status = matches.length ? "flagged" : "possible_match"
    if (!matches.length) matches = []
  } else {
    matches = all
    const distinct = new Set(all.map((m) => normProduct(m.product).split(" ")[0]))
    status = distinct.size === 1 && batchNorm.length >= 5 ? "flagged" : "possible_match"
  }
  const shown = matches.length ? matches : otherProducts
  return {
    query: { batch: input.batch, product },
    status,
    severity: Math.max(0, ...shown.map((m) => m.severity)),
    authorities: [...new Set(shown.map((m) => m.authority))],
    matches,
    otherProducts,
    sightings,
    note:
      status === "possible_match"
        ? "A batch with this number is on a recall list, but for a different or unconfirmed product. Short batch numbers collide, so check the product name and manufacturer."
        : "Compare the batch, product and manufacturer with the label before acting.",
  }
}

export async function searchAlerts(client: PublicClient, q: string, limit = 25, by: "product" | "manufacturer" = "product", opts: { includeHidden?: boolean } = {}) {
  const prefix = by === "manufacturer" ? normMfr(q) : productKey(q)
  if (prefix.length < 2) return []
  const field = by === "manufacturer" ? "mfr_norm" : "product_norm"
  const res = await client
    .select({ key: true, owner: true, attributes: true, payload: true, expiresAt: true, creationFlags: true })
    .where(and(eq("app", APP), eq("kind", "alert"), startsWith(field, prefix)))
    .limit(Math.min(limit, PAGE))
    .fetch()
  return res.entities.map((e) => toMatch(e, null)).filter((m) => opts.includeHidden || !isHidden(m)).sort((a, b) => b.severity - a.severity)
}

export type BrowseParams = { severity?: number; authority?: string; month?: string; cursor?: string; limit?: number }

/** One page of alerts, filtered. The node limits how deep a cursor can go, so `capped` tells the UI when it hit that. */
export async function browseAlerts(client: PublicClient, p: BrowseParams = {}) {
  const conds = [eq("app", APP), eq("kind", "alert")]
  if (p.severity) conds.push(eq("severity", p.severity))
  if (p.authority) conds.push(eq("authority", p.authority))
  if (p.month) {
    const ym = Number(p.month.replace("-", ""))
    conds.push(gte("list_ym", ym), lte("list_ym", ym))
  }
  let q = (client as any)
    .select({ key: true, owner: true, attributes: true, payload: true, expiresAt: true, creationFlags: true })
    .where(and(...conds))
    .limit(Math.min(p.limit ?? 40, PAGE))
  if (p.cursor) q = q.cursor(p.cursor)
  try {
    const page = await q.fetch()
    return {
      results: page.entities.map((e: any) => toMatch(e, null)).filter((m: Match) => !isHidden(m)),
      next: (page.cursor as string | undefined) ?? null,
      capped: false,
    }
  } catch (err) {
    if (err instanceof QueryError && err.kind === "cursor") return { results: [], next: null, capped: true }
    throw err
  }
}

const BROWSE_PAGE = 40

/**
 * Browse without node cursors: the node refuses deep cursors (and a cursor from a shared RPC can fail on page 2),
 * so the API loads the whole alert set once, caches it, and pages through it with a plain offset.
 */
export async function loadAllAlerts(client: PublicClient, now = new Date()): Promise<Match[]> {
  const rows = await collectAlerts(client, { key: true, owner: true, attributes: true, payload: true, expiresAt: true, creationFlags: true }, now)
  const seen = new Set<string>()
  return rows
    .map((e: any) => toMatch(e, null))
    .filter((m: Match) => !isHidden(m) && !seen.has(m.key) && !!seen.add(m.key))
    .sort((a: Match, b: Match) => b.severity - a.severity || String(b.listMonth).localeCompare(String(a.listMonth)))
}

export function pageAlerts(all: Match[], p: BrowseParams = {}) {
  const rows = all.filter((m) => (!p.severity || m.severity === p.severity) && (!p.authority || m.authority === p.authority) && (!p.month || m.listMonth === p.month))
  const start = p.cursor?.startsWith("o:") ? Math.max(0, Number(p.cursor.slice(2)) || 0) : 0
  const end = start + (p.limit ?? BROWSE_PAGE)
  return { results: rows.slice(start, end), next: end < rows.length ? `o:${end}` : null, capped: false, total: rows.length }
}

/** Alerts published in the last couple of months, worst first: the "recently flagged" feed. */
export async function recentAlerts(client: PublicClient, now = new Date(), limit = 12) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1))
  const from = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1
  const res = await client
    .select({ key: true, owner: true, attributes: true, payload: true, expiresAt: true, creationFlags: true })
    .where(and(eq("app", APP), eq("kind", "alert"), gte("list_ym", from)))
    .limit(PAGE)
    .fetch()
  return res.entities
    .map((e) => ({ m: toMatch(e, null), ym: Number(attr(e, "list_ym")) }))
    .filter((x) => !isHidden(x.m))
    .sort((a, b) => b.m.severity - a.m.severity || b.ym - a.ym)
    .slice(0, limit)
    .map((x) => x.m)
}

async function sightingSummary(client: PublicClient, batchNorm: string) {
  const res = await client
    .select({ attributes: { pin3: true } })
    .where(and(eq("app", APP), eq("kind", "sighting"), eq("batch_norm", batchNorm)))
    .limit(PAGE)
    .fetch()
  const pin3 = [...new Set(res.entities.map((e) => Number(attr(e, "pin3"))))].sort((a, b) => a - b)
  return { count: res.entities.length, pin3 }
}

export type SightingInput = { batch: string; pincode: string; reporterType: string }

export class BadRequest extends Error {}

export function validateSighting(i: SightingInput): { batch: string; pincode: string; reporterType: ReporterType } {
  const batch = (i.batch ?? "").trim()
  if (!normBatch(batch)) throw new BadRequest("batch is required")
  if (batch.length > 40) throw new BadRequest("batch is too long")
  if (!isPincode(String(i.pincode ?? ""))) throw new BadRequest("pincode must be 6 digits")
  if (!(REPORTER_TYPES as readonly string[]).includes(i.reporterType))
    throw new BadRequest(`reporterType must be one of ${REPORTER_TYPES.join(", ")}`)
  return { batch, pincode: String(i.pincode), reporterType: i.reporterType as ReporterType }
}

/** A repeat sighting of the same batch in the same pincode renews the existing entity instead of adding a new one. */
export async function recordSighting(
  pub: PublicClient,
  wallet: WalletClient,
  input: SightingInput,
  now = new Date(),
) {
  const v = validateSighting(input)
  const batchNorm = normBatch(v.batch)
  const existing = await pub
    .select({ key: true, owner: true })
    .where(and(eq("app", APP), eq("kind", "sighting"), eq("batch_norm", batchNorm), eq("pincode", Number(v.pincode))))
    .limit(1)
    .fetch()
  const hit = existing.entities.find((e) => e.owner?.toLowerCase() === wallet.account.address.toLowerCase())
  if (hit?.key) {
    try {
      const { txHash } = await wallet.extendEntity({ entityKey: hit.key, expires: ExpirationTime.fromDays(SIGHTING_DAYS) })
      return { status: "renewed" as const, entityKey: hit.key, txHash }
    } catch (err) {
      // An extension that would not move the expiry later is rejected; the sighting is already fresh.
      if (/later|expir/i.test(String((err as Error).message))) return { status: "already_fresh" as const, entityKey: hit.key }
      throw err
    }
  }
  const { entityKey, txHash } = await wallet.createEntity(
    buildSightingEntity({ ...v, seenOn: ymd(now) }),
  )
  return { status: "created" as const, entityKey, txHash }
}

/** Sightings aggregated by 3-digit pincode prefix (roughly a postal district). */
export async function sightingMap(client: PublicClient, batch?: string) {
  const where = batch
    ? and(eq("app", APP), eq("kind", "sighting"), eq("batch_norm", normBatch(batch)))
    : and(eq("app", APP), eq("kind", "sighting"))
  const byPin3 = new Map<number, { pin3: number; count: number; batches: Set<string> }>()
  for await (const e of client.select({ attributes: { pin3: true, batch_norm: true } }).where(where)) {
    const p3 = Number(attr(e, "pin3"))
    const row = byPin3.get(p3) ?? { pin3: p3, count: 0, batches: new Set<string>() }
    row.count++
    row.batches.add(String(attr(e, "batch_norm")))
    byPin3.set(p3, row)
  }
  return [...byPin3.values()]
    .map((r) => ({ pin3: r.pin3, count: r.count, batches: [...r.batches] }))
    .sort((a, b) => b.count - a.count)
}

// ---------- seeding ----------

const FIRST_YM = 202401 // nothing we mirror is older than this

const ymIndex = (ym: number) => Math.floor(ym / 100) * 12 + (ym % 100) - 1
const ymFromIndex = (i: number) => Math.floor(i / 12) * 100 + (i % 12) + 1

/**
 * Every live alert, with the given selection. Arkiv rejects a cursor walk that goes too deep
 * (about five pages: `-32005 Request exceeds defined limit`), so a big collection cannot be read
 * in one go. We walk by `list_ym` range and, when the node rejects a walk, split the range in half
 * and retry; a failed attempt's partial pages are discarded so nothing is counted twice.
 */
export async function collectAlerts(client: PublicClient, selection: Record<string, unknown>, now = new Date()): Promise<any[]> {
  const lastYm = now.getUTCFullYear() * 100 + now.getUTCMonth() + 1 + 1 // include next month
  const walk = async (lo: number, hi: number, attempt = 0): Promise<any[]> => {
    try {
      const rows: any[] = []
      let page = await (client as any)
        .select(selection)
        .where(and(eq("app", APP), eq("kind", "alert"), gte("list_ym", ymFromIndex(lo)), lte("list_ym", ymFromIndex(hi))))
        .limit(PAGE)
        .fetch()
      rows.push(...page.entities)
      while (page.hasNextPage()) {
        page = await page.next()
        rows.push(...page.entities)
      }
      return rows
    } catch (err) {
      if (err instanceof QueryError && err.kind === "cursor") {
        if (lo < hi) {
          const mid = Math.floor((lo + hi) / 2)
          return [...(await walk(lo, mid)), ...(await walk(mid + 1, hi))]
        }
        // a single month: the cursor was tied to a block that has since moved on, so start the page-through again
        if (attempt < 3) return walk(lo, hi, attempt + 1)
      }
      throw err
    }
  }
  const lo = ymIndex(FIRST_YM)
  const hi = ymIndex(lastYm)
  // start from year-sized chunks: few requests when the collection is small
  const out: any[] = []
  for (let a = lo; a <= hi; a += 12) out.push(...(await walk(a, Math.min(a + 11, hi))))
  return out
}

export async function existingDedupes(client: PublicClient): Promise<Set<string>> {
  const rows = await collectAlerts(client, { attributes: { dedupe: true } })
  return new Set(rows.map((e) => String(attr(e, "dedupe"))))
}

export type SeedReport = {
  total: number
  created: number
  locked: number
  skippedExpired: number
  skippedInvalid: number
  skippedDuplicate: number
  failedBatches: number
}

export async function seedAlerts(
  pub: PublicClient,
  wallet: WalletClient,
  records: AlertRecord[],
  opts: { batchSize?: number; lock?: boolean; dryRun?: boolean; limit?: number; log?: (s: string) => void } = {},
): Promise<SeedReport> {
  const log = opts.log ?? (() => {})
  const report: SeedReport = { total: records.length, created: 0, locked: 0, skippedExpired: 0, skippedInvalid: 0, skippedDuplicate: 0, failedBatches: 0 }
  const have = opts.dryRun ? new Set<string>() : await existingDedupes(pub)
  const queue: Planned[] = []
  for (const r of records) {
    const plan = planAlert(r)
    if (plan.skip) {
      if (plan.skip === "expired") report.skippedExpired++
      else report.skippedInvalid++
      continue
    }
    const k = plan.create.attributes.dedupe
    if (have.has(k)) { report.skippedDuplicate++; continue }
    have.add(k)
    queue.push(plan)
  }
  const work = opts.limit ? queue.slice(0, opts.limit) : queue
  log(`plan: ${work.length} to create, ${report.skippedDuplicate} duplicates or already on chain, ${report.skippedExpired} expired, ${report.skippedInvalid} invalid`)
  if (opts.dryRun) { report.created = work.length; return report }

  const size = opts.batchSize ?? 25
  const createdKeys: Hex[] = []
  const send = async (chunk: typeof work): Promise<void> => {
    try {
      const out = await wallet.executeBatch({ creates: chunk.map((c) => c.create) })
      createdKeys.push(...out.createdEntities)
      report.created += chunk.length
      log(`  created ${report.created}/${work.length} (tx ${out.txHash.slice(0, 12)}…)`)
    } catch (err) {
      if (chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2)
        await send(chunk.slice(0, mid))
        await send(chunk.slice(mid))
      } else {
        report.failedBatches++
        log(`  FAILED ${chunk[0]?.record.batch}: ${(err as Error).message.split("\n")[0]}`)
      }
    }
  }
  for (let i = 0; i < work.length; i += size) await send(work.slice(i, i + size))

  if (opts.lock !== false && createdKeys.length) {
    for (let i = 0; i < createdKeys.length; i += 100) {
      const chunk = createdKeys.slice(i, i + 100)
      try {
        await wallet.executeBatch({ ownershipChanges: chunk.map((entityKey) => ({ entityKey, newOwner: DEAD_ADDRESS })) })
        report.locked += chunk.length
      } catch (err) {
        log(`  lock failed for ${chunk.length} entities: ${(err as Error).message.split("\n")[0]}`)
      }
    }
  }
  return report
}
