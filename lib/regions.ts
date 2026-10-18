import type { District } from "./types.ts"

// Pincode prefix (first two digits) -> postal region and a representative point.
export const REGIONS: [number[], string, number, number][] = [
  [[11], "Delhi", 28.61, 77.21], [[12, 13], "Haryana", 29.06, 76.09], [[14, 15, 16], "Punjab / Chandigarh", 31.0, 75.6], [[17], "Himachal Pradesh", 31.1, 77.17],
  [[18, 19], "Jammu & Kashmir", 33.3, 75.3], [[20, 21, 22, 23, 24, 25, 26, 27, 28], "Uttar Pradesh / Uttarakhand", 26.9, 80.0], [[30, 31, 32, 33, 34], "Rajasthan", 26.9, 73.8],
  [[36, 37, 38, 39], "Gujarat", 22.3, 71.7], [[40, 41, 42, 43, 44], "Maharashtra", 19.5, 75.7], [[45, 46, 47, 48], "Madhya Pradesh", 23.5, 78.0], [[49], "Chhattisgarh", 21.3, 81.8],
  [[50], "Telangana", 17.9, 79.0], [[51, 52, 53], "Andhra Pradesh", 15.9, 79.7], [[56, 57, 58, 59], "Karnataka", 14.5, 76.0], [[60, 61, 62, 63, 64], "Tamil Nadu", 11.1, 78.7],
  [[67, 68, 69], "Kerala", 10.5, 76.3], [[70, 71, 72, 73, 74], "West Bengal", 23.0, 87.8], [[75, 76, 77], "Odisha", 20.5, 84.5], [[78], "Assam", 26.2, 92.9], [[79], "North-East", 25.5, 93.5],
  [[80, 81, 82], "Bihar", 25.6, 85.6], [[83, 84, 85], "Jharkhand", 23.6, 85.3],
]

export type RegionGroup = { name: string; lat: number; lon: number; count: number; pins: number[]; batches: string[] }

const regionOf = (pin3: number) => REGIONS.find((r) => r[0].includes(Math.floor(pin3 / 10)))

/** Group the API's per-pin3 counts by postal region, biggest first. */
export function groupRegions(districts: District[]): RegionGroup[] {
  const by = new Map<string, RegionGroup & { set: Set<string> }>()
  for (const d of districts) {
    const r = regionOf(d.pin3)
    if (!r) continue
    const e = by.get(r[1]) ?? { name: r[1], lat: r[2], lon: r[3], count: 0, pins: [], batches: [], set: new Set<string>() }
    e.count += d.count
    e.pins.push(d.pin3)
    d.batches.forEach((b) => e.set.add(b))
    by.set(r[1], e)
  }
  return [...by.values()]
    .map(({ set, ...g }) => ({ ...g, batches: [...set] }))
    .sort((a, b) => b.count - a.count)
}
