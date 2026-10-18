import { describe, expect, it } from "vitest"
import { groupRegions } from "./regions.ts"

describe("groupRegions", () => {
  it("puts Chhindwara (480) in Madhya Pradesh and merges districts of one region", () => {
    const g = groupRegions([
      { pin3: 480, count: 2, batches: ["SR13"] },
      { pin3: 482, count: 1, batches: ["SR13", "R01GL2523"] },
      { pin3: 600, count: 1, batches: ["SR13"] },
    ])
    expect(g[0]).toMatchObject({ name: "Madhya Pradesh", count: 3, pins: [480, 482] })
    expect(g[0]!.batches.sort()).toEqual(["R01GL2523", "SR13"])
    expect(g[1]).toMatchObject({ name: "Tamil Nadu", count: 1 })
  })
  it("ignores prefixes outside the table instead of crashing", () => {
    expect(groupRegions([{ pin3: 999, count: 1, batches: ["X"] }])).toEqual([])
  })
})
