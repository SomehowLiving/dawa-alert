import { describe, expect, it } from "vitest"
import { QueryError, render } from "@arkiv-network/sdk/query"
import { i32 } from "@arkiv-network/sdk/attr"
import { collectAlerts } from "./service.ts"
import type { PublicClient } from "./arkiv.ts"

/** A node that, like Tiramisu, refuses to page deeper than `maxPages` in one walk. */
function cappedNode(listYms: number[], maxPages: number) {
  const all = listYms.map((ym, i) => ({ key: `0x${i}`, attributes: { list_ym: i32(ym), dedupe: { value: `d${i}` } } }))
  const calls = { walks: 0, deniedWalks: 0 }
  const client = {
    select() {
      let expr = ""
      let size = 200
      const b: any = {
        where(e: any) { expr = render(e); return b },
        limit(n: number) { size = n; return b },
        async fetch() {
          calls.walks++
          const lo = Number(/list_ym >= i32\((\d+)\)/.exec(expr)![1])
          const hi = Number(/list_ym <= i32\((\d+)\)/.exec(expr)![1])
          const hits = all.filter((r) => r.attributes.list_ym.value >= lo && r.attributes.list_ym.value <= hi)
          const page = (n: number): any => ({
            entities: hits.slice(n * size, (n + 1) * size),
            hasNextPage: () => (n + 1) * size < hits.length,
            next: async () => {
              if (n + 1 >= maxPages) {
                calls.deniedWalks++
                throw new QueryError("cursor", -32005, expr, { message: "cursor belongs to a different query" }, "Request exceeds defined limit")
              }
              return page(n + 1)
            },
          })
          return page(0)
        },
      }
      return b
    },
  } as unknown as PublicClient
  return { client, calls }
}

const NOW = new Date("2026-10-18T00:00:00Z")
const spread = (n: number) => Array.from({ length: n }, (_, i) => [202501, 202506, 202511, 202603, 202608, 202610][i % 6]!)

describe("collectAlerts", () => {
  it("returns a small collection in one go", async () => {
    const { client } = cappedNode(spread(30), 5)
    expect(await collectAlerts(client, { key: true }, NOW)).toHaveLength(30)
  })

  it("splits the range when the node refuses a deep walk, and loses or repeats nothing", async () => {
    const { client, calls } = cappedNode(spread(3000), 5) // 3000 rows over a few months, 5-page cap
    const rows = await collectAlerts(client, { key: true }, NOW)
    expect(rows).toHaveLength(3000)
    expect(new Set(rows.map((r) => r.key)).size).toBe(3000)
    expect(calls.deniedWalks).toBeGreaterThan(0) // the cap was really hit and recovered from
  })

  it("gives up with the node's error when one month alone exceeds the cap", async () => {
    const { client } = cappedNode(Array(2000).fill(202603), 5) // 2000 rows, all in one month: cannot split further
    await expect(collectAlerts(client, { key: true }, NOW)).rejects.toBeInstanceOf(QueryError)
  })
})
