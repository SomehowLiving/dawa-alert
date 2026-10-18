import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

/**
 * Anonymous callers get a small query budget; once it is spent the node answers `ANON_COST_LIMITED`
 * and the SDK's default transport retries for a very long time instead of showing that error.
 * So: send the access key (header, not URL, to keep it out of logs) and fail fast.
 */
function transport(rpcUrl?: string) {
  const key = process.env.ARKIV_API_KEY ?? process.env.TOKEN // hub.arkiv.network access key
  return http(rpcUrl, {
    timeout: 12_000,
    retryCount: 1,
    ...(key ? { fetchOptions: { headers: { "X-API-KEY": key } } } : {}),
  })
}

export function makePublicClient(rpcUrl?: string) {
  return createPublicClient({ chain: tiramisu, transport: transport(rpcUrl) })
}

export function makeWalletClient(privateKey: string, rpcUrl?: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("PRIVATE_KEY must be 0x + 64 hex chars")
  return createWalletClient({
    chain: tiramisu,
    transport: transport(rpcUrl),
    account: privateKeyToAccount(privateKey as Hex),
  })
}

export type PublicClient = ReturnType<typeof makePublicClient>
export type WalletClient = ReturnType<typeof makeWalletClient>
