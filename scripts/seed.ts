// Usage: node --env-file-if-exists=.env.local scripts/seed.ts [--dry-run] [--limit N] [--no-lock] [--batch N]
import { makePublicClient, makeWalletClient } from "../lib/arkiv.ts"
import { loadRecords } from "../lib/records.ts"
import { seedAlerts } from "../lib/service.ts"
import { computeStats, publishStats } from "../lib/stats.ts"
import { formatEther } from "viem"

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const val = (n: string) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : undefined)

const pub = makePublicClient(process.env.ARKIV_RPC)
const key = process.env.PRIVATE_KEY
if (!key && !flag("--dry-run")) throw new Error("PRIVATE_KEY is not set (see .env.example)")
const wallet = key ? makeWalletClient(key, process.env.ARKIV_RPC) : undefined

const records = loadRecords()
console.log(`loaded ${records.length} records`)
if (wallet) {
  const bal = await pub.getBalance({ address: wallet.account.address })
  console.log(`wallet ${wallet.account.address} balance ${formatEther(bal)} GLM`)
  if (bal === 0n && !flag("--dry-run")) {
    console.error("Wallet has no funds. Claim testnet GLM at https://hub.arkiv.network/faucet")
    process.exit(2)
  }
}
const report = await seedAlerts(pub, wallet as any, records, {
  dryRun: flag("--dry-run"),
  lock: !flag("--no-lock"),
  limit: val("--limit"),
  batchSize: val("--batch"),
  log: console.log,
})
console.log(report)

// Refresh the dashboard snapshot so the site shows the new numbers immediately.
if (wallet && !flag("--dry-run") && !flag("--no-stats")) {
  const stats = await computeStats(pub, Date.now())
  await publishStats(wallet, stats)
  console.log(`published stats snapshot: ${stats.alerts} alerts, indexed through ${stats.indexedThrough}`)
}
