// Compute the dashboard numbers (slow: walks every alert) and publish them as one Arkiv entity.
// Usage: node --env-file-if-exists=.env.local scripts/publish-stats.ts
import { makePublicClient, makeWalletClient } from "../lib/arkiv.ts"
import { computeStats, publishStats } from "../lib/stats.ts"

const key = process.env.PRIVATE_KEY
if (!key) throw new Error("PRIVATE_KEY is not set (see .env.example)")
const pub = makePublicClient(process.env.ARKIV_RPC)
const wallet = makeWalletClient(key, process.env.ARKIV_RPC)

console.log("computing stats (this walks every alert, so it takes a while)…")
const t0 = Date.now()
const stats = await computeStats(pub, Date.now())
console.log(`  ${stats.alerts} alerts, indexed through ${stats.indexedThrough}, in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const { entityKey, txHash } = await publishStats(wallet, stats)
console.log("published snapshot", entityKey, "tx", txHash.slice(0, 14) + "…")
