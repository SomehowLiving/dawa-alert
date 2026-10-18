import type { Hex } from "viem"

// Shapes that cross the API boundary. Client components import these as types only.

export type Match = {
  key: Hex
  owner: Hex | undefined
  authority: string
  source: string
  severity: number
  product: string
  batch: string
  mfgYm: string | null
  expiryYm: string | null
  manufacturer: string
  reason: string
  lab: string
  listMonth: string | null
  proof: { doc: string; sha256: string | null; url: string | null; row: number | null; extraction?: string | null; retrieved_at?: string | null }
  expiresAtBlock: string | undefined
  similarity: number
  readonly: boolean
}

export type Verdict = {
  query: { batch: string; product: string | null }
  status: "flagged" | "possible_match" | "not_found"
  severity: number
  authorities: string[]
  matches: Match[]
  otherProducts: Match[]
  sightings: { count: number; pin3: number[] }
  note: string
}


export type Severity = 1 | 2 | 3

export type Stats = {
  alerts: number
  sightings: number
  byAuthority: Record<string, number>
  bySeverity: Record<string, number>
  /** Alerts per list month, oldest first: `{ ym: "2026-08", n: 221 }`. */
  byMonth: { ym: string; n: number }[]
  indexedThrough: string | null
  asOf: string
}

export type Health = {
  ok: boolean
  chainId: number
  block: string
  relay: { address: string; balanceGLM: string } | null
  features: { ocr: boolean; report: boolean }
}

export type BrowseResult = { results: Match[]; next: string | null; capped: boolean }
export type District = { pin3: number; count: number; batches: string[] }
