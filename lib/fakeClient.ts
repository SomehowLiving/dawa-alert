import { render } from "@arkiv-network/sdk/query"
import { i32 } from "@arkiv-network/sdk/attr"
import type { PublicClient } from "./arkiv.ts"

export type Row = { kind: "alert" | "sighting" | "stats"; batch_norm: string; authority?: string; severity?: number; product?: string; batch?: string; pin3?: number; src?: string; payload?: unknown }

/** Just enough of the SDK's select().where().limit().fetch() chain to exercise our logic. */
export function fake(rows: Row[]): PublicClient {
  return {
    async getChainId() { return 7738577 },
    async getBlockNumber() { return 42n },
    async getBalance() { return 10n ** 18n },
    select() {
      let expr = ""
      const b: any = {
        where(e: any) { expr = render(e); return b },
        limit() { return b },
        cursor() { return b },
        async *[Symbol.asyncIterator]() { yield* (await b.fetch()).entities },
        async fetch() {
          const kind = /kind = str\('(\w+)'\)/.exec(expr)?.[1]
          const batch = /batch_norm = str\('([^']+)'\)/.exec(expr)?.[1]
          const hits = rows.filter((r) => r.kind === kind && (!batch || r.batch_norm === batch))
          return {
            cursor: undefined,
            hasNextPage: () => false,
            next: async () => { throw new Error("no more pages") },
            entities: hits.map((r) => ({
              key: `0x${Math.random().toString(16).slice(2)}`,
              owner: "0x000000000000000000000000000000000000dEaD",
              expiresAt: 123n,
              creationFlags: { readonly: true },
              attributes: {
                authority: { value: r.authority },
                source: { value: r.src ?? "x" },
                severity: i32(r.severity ?? 1),
                pin3: i32(r.pin3 ?? 0),
                batch_norm: { value: r.batch_norm },
              },
              toJson: () => r.payload ?? ({ product: r.product, batch: r.batch ?? r.batch_norm, reason: "r", proof: {} }),
            })),
          }
        },
      }
      return b
    },
  } as unknown as PublicClient
}

