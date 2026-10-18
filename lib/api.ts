// The HTTP API as plain functions over the Web Request/Response types. Next.js route handlers call
// `handle()`; tests call `request()`. Everything stateful (cache, rate limit) lives here.
import { formatEther } from "viem"
import type { PublicClient, WalletClient } from "./arkiv.ts"
import { normBatch, normProduct } from "./normalize.ts"
import { computeStats, countSightings, readStatsSnapshot } from "./stats.ts"
import {
  BadRequest,
  browseAlerts,
  checkBatch,
  recentAlerts,
  recordSighting,
  searchAlerts,
  sightingMap,
} from "./service.ts"
import type { Health, Stats } from "./types.ts"

export type ApiDeps = {
  pub: PublicClient
  wallet?: WalletClient | undefined
  /** Sighting writes allowed per client address per hour. */
  ratePerHour?: number
  now?: () => number
  /** Reads a label photo; absent when no vision key is configured. */
  ocr?: ((dataUrl: string) => Promise<{ batch: string | null; product: string | null }>) | undefined
}

const AUTHORITIES = ["WHO", "CDSCO", "State drug lab", "State drug controller"]
const attr = (e: any, n: string) => e.attributes?.[n]?.value
const json = (body: unknown, status = 200) => Response.json(body, { status })
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"

export function createApi({ pub, wallet, ratePerHour = 20, now = Date.now, ocr }: ApiDeps) {
  const hits = new Map<string, number[]>()
  const limited = (ip: string) => {
    const t = now()
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < 3600_000)
    if (recent.length >= ratePerHour) { hits.set(ip, recent); return true }
    recent.push(t)
    hits.set(ip, recent)
    return false
  }

  /** Query budget is limited per access key, so identical reads within a short window share one query. */
  const cache = new Map<string, { at: number; value?: unknown; inflight?: Promise<unknown> }>()
  const memo = async <T>(key: string, ttlMs: number, fn: () => Promise<T>, opts: { swr?: boolean } = {}): Promise<T> => {
    const hit = cache.get(key)
    if (hit?.inflight && !(opts.swr && hit.value !== undefined)) return hit.inflight as Promise<T>
    const fresh = hit && hit.value !== undefined && now() - hit.at < ttlMs
    if (fresh) return hit.value as T
    // Stale-while-revalidate: an expensive read (stats walks ~2,400 entities) is served from the old value
    // while one refresh runs in the background, so nobody waits for it after the first load.
    const refresh = () => {
      const inflight = fn().then(
        (value) => { cache.set(key, { at: now(), value }); return value },
        (err) => { if (hit?.value !== undefined) cache.set(key, { at: hit.at, value: hit.value }); else cache.delete(key); throw err },
      )
      cache.set(key, { at: hit?.at ?? 0, inflight, ...(hit?.value !== undefined ? { value: hit.value } : {}) })
      return inflight
    }
    if (opts.swr && hit && hit.value !== undefined) {
      if (!hit.inflight) void refresh().catch(() => {})
      return hit.value as T
    }
    return refresh()
  }
  const invalidate = (prefix: string) => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k) }

  /** Prefer the published snapshot (one fast query); count sightings live so reports show at once. */
  const stats = async (): Promise<Stats> => {
    const snap = await memo("stats:snapshot", 5 * 60_000, () => readStatsSnapshot(pub), { swr: true })
    if (snap) {
      const sightings = await memo("stats:sightings", 30_000, () => countSightings(pub))
      return { ...snap, sightings }
    }
    return memo("stats:live", 5 * 60_000, () => computeStats(pub, now()), { swr: true })
  }

  const routes: Record<string, (req: Request, url: URL) => Promise<Response>> = {
    "GET /api/health": async () => {
      const [chainId, block] = await Promise.all([pub.getChainId(), pub.getBlockNumber()])
      const relay = wallet
        ? { address: wallet.account.address, balanceGLM: formatEther(await pub.getBalance({ address: wallet.account.address })) }
        : null
      const body: Health = { ok: true, chainId, block: block.toString(), relay, features: { ocr: Boolean(ocr), report: Boolean(wallet) } }
      return json(body)
    },

    "GET /api/check": async (_req, url) => {
      const batch = url.searchParams.get("batch") ?? ""
      const product = url.searchParams.get("product")
      return json(await memo(`check:${normBatch(batch)}:${normProduct(product ?? "")}`, 60_000, () => checkBatch(pub, { batch, product })))
    },

    "GET /api/alerts": async (_req, url) => {
      const q = url.searchParams.get("q") ?? ""
      const by = url.searchParams.get("by") === "manufacturer" ? "manufacturer" : "product"
      const limit = Number(url.searchParams.get("limit") ?? 25)
      return json({ q, by, results: await memo(`search:${by}:${q.toLowerCase().trim()}:${limit}`, 60_000, () => searchAlerts(pub, q, limit, by)) })
    },

    "GET /api/browse": async (_req, url) => {
      const g = (k: string) => url.searchParams.get(k) || undefined
      const sev = g("severity"), authority = g("authority"), month = g("month"), cursor = g("cursor")
      if (sev && !["1", "2", "3"].includes(sev)) throw new BadRequest("severity must be 1, 2 or 3")
      if (authority && !AUTHORITIES.includes(authority)) throw new BadRequest(`authority must be one of ${AUTHORITIES.join(", ")}`)
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequest("month must look like 2026-08")
      if (cursor && cursor.length > 2000) throw new BadRequest("bad cursor")
      const params = { ...(sev && { severity: Number(sev) }), ...(authority && { authority }), ...(month && { month }), ...(cursor && { cursor }) }
      return json(await memo(`browse:${JSON.stringify(params)}`, 60_000, () => browseAlerts(pub, params)))
    },

    "GET /api/recent": async () => json({ results: await memo("recent", 5 * 60_000, () => recentAlerts(pub, new Date(now())), { swr: true }) }),

    "GET /api/sightings/map": async (_req, url) => {
      const b = url.searchParams.get("batch") || undefined
      return json({ districts: await memo(`map:${b ? normBatch(b) : ""}`, 30_000, () => sightingMap(pub, b)) })
    },

    "GET /api/stats": async () => json(await stats()),

    "POST /api/sightings": async (req) => {
      if (!wallet) return json({ error: "this deployment is read-only (no relay wallet configured)" }, 503)
      if (limited(clientIp(req))) return json({ error: "rate limit: too many reports from this address, try again later" }, 429)
      const body = (await req.json().catch(() => null)) as Record<string, string> | null
      if (!body) throw new BadRequest("JSON body required")
      const out = await recordSighting(pub, wallet, {
        batch: String(body.batch ?? ""),
        pincode: String(body.pincode ?? ""),
        reporterType: String(body.reporterType ?? ""),
      })
      invalidate("check:"); invalidate("map:"); invalidate("stats:sightings") // a new sighting changes both
      return json(out, out.status === "created" ? 201 : 200)
    },

    "POST /api/ocr": async (req) => {
      if (!ocr) return json({ error: "photo reading is not enabled on this deployment; type the batch number" }, 501)
      if (limited(`ocr:${clientIp(req)}`)) return json({ error: "rate limit" }, 429)
      const body = (await req.json().catch(() => null)) as { image?: string } | null
      if (!body?.image) throw new BadRequest("image (data URL) required")
      try {
        return json(await ocr(body.image))
      } catch (err) {
        throw new BadRequest(String((err as Error).message))
      }
    },
  }

  /** Route a Request. Unknown paths 404; errors become JSON. */
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const route = routes[`${req.method} ${url.pathname.replace(/\/$/, "")}`]
    if (!route) return json({ error: "not found" }, 404)
    try {
      return await route(req, url)
    } catch (err) {
      if (err instanceof BadRequest) return json({ error: err.message }, 400)
      console.error(err)
      return json({ error: "upstream error talking to Arkiv", detail: String((err as Error).message).split("\n")[0] }, 502)
    }
  }

  /** Convenience for tests and scripts: `request("/api/check?batch=SR13")`. */
  const request = (path: string, init?: RequestInit) => handle(new Request(new URL(path, "http://dawa.test"), init))

  return { handle, request }
}

export type Api = ReturnType<typeof createApi>
