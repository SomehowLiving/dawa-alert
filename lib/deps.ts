// The one place that reads environment variables and builds real clients.
import { createApi, type Api } from "./api.ts"
import { makePublicClient, makeWalletClient } from "./arkiv.ts"
import { makeOcr } from "./ocr.ts"

const g = globalThis as { __dawaApi?: Api }

/** One API instance per server process (survives dev hot reloads), so cache and rate limits persist. */
export function getApi(): Api {
  g.__dawaApi ??= createApi({
    pub: makePublicClient(process.env.ARKIV_RPC),
    wallet: process.env.PRIVATE_KEY ? makeWalletClient(process.env.PRIVATE_KEY, process.env.ARKIV_RPC) : undefined,
    ratePerHour: Number(process.env.RELAY_RATE_PER_HOUR ?? 20),
    ocr: process.env.ANTHROPIC_API_KEY ? makeOcr(process.env.ANTHROPIC_API_KEY) : undefined,
  })
  return g.__dawaApi
}
