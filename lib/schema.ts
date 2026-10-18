// How Dawa Alert maps onto Arkiv entities. See ../arkiv/schema.md for the prose version.
import { i32 } from "@arkiv-network/sdk/attr"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { createHash } from "node:crypto"
import {
  authorityOf,
  normBatch,
  normMfr,
  normProduct,
  productKey,
  severityOf,
  ymToEndOfMonth,
  ymToInt,
} from "./normalize.ts"

/**
 * Sources of an early PDF import whose product names are mangled ("Calc ium") and which duplicate the
 * portal's clean rows. They were written and locked before we noticed, so they cannot be deleted:
 * the API hides them instead, and records.ts no longer loads them.
 */
export const LEGACY_SOURCES: ReadonlySet<string> = new Set(["cdsco_nsq", "cdsco_state_nsq"])

export const APP = "dawa-alert"
export const SCHEMA_VERSION = 1

/** Raw record as produced by scripts/fetch_portal.py, parse_cdsco.py or data/alerts_who.json. */
export type AlertRecord = {
  source: string
  list_month: string | null
  row: number | null
  product: string
  batch: string
  mfg_ym: string | null
  expiry_ym: string | null
  expiry_raw?: string
  manufacturer: string
  reason: string
  lab: string
  doc: string
  doc_sha256: string | null
  doc_url: string | null
  /** When the source was fetched, and by what method (cdsco-json-api, pdf-table-parse, manual-from-who-annex, press-report). */
  retrieved_at?: string | null
  extraction?: string
}

/** Burn address. Ownership of an alert is sent here so that nobody, including us, can delete it. */
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const

/** Contamination alerts outlive the drug's printed expiry: bottles linger in home cabinets. */
export const SEVERE_GRACE_DAYS = 365
export const UNKNOWN_EXPIRY_DAYS = 180
export const SIGHTING_DAYS = 30
const MIN_LIFETIME_MS = 24 * 3600 * 1000

/** Stable key so re-running the seed never writes the same alert twice. */
export function dedupeKey(r: Pick<AlertRecord, "source" | "batch" | "product" | "manufacturer">): string {
  const authority = authorityOf(r.source)
  return createHash("sha256")
    .update([authority, normBatch(r.batch), normProduct(r.product), normMfr(r.manufacturer)].join("|"))
    .digest("hex")
    .slice(0, 24)
}

export type AlertPlan =
  | { skip: "expired" | "invalid"; record: AlertRecord }
  | { skip?: undefined; create: ReturnType<typeof buildAlertEntity>; record: AlertRecord }

/** Decide whether a record can be stored now, and build the entity if so. */
export function planAlert(r: AlertRecord, now = new Date()): AlertPlan {
  if (!normBatch(r.batch) || !normProduct(r.product)) return { skip: "invalid", record: r }
  const severity = severityOf(r.source, r.reason)
  const end = r.expiry_ym ? ymToEndOfMonth(r.expiry_ym) : null
  let deadline: Date
  if (end) {
    deadline = severity === 3 ? new Date(end.getTime() + SEVERE_GRACE_DAYS * 86400_000) : end
  } else {
    deadline = new Date(now.getTime() + UNKNOWN_EXPIRY_DAYS * 86400_000)
  }
  if (deadline.getTime() - now.getTime() < MIN_LIFETIME_MS) return { skip: "expired", record: r }
  return { create: buildAlertEntity(r, severity, deadline, end === null), record: r }
}

export function buildAlertEntity(r: AlertRecord, severity: number, deadline: Date, expiryUnknown: boolean) {
  return {
    attributes: {
      app: APP,
      kind: "alert",
      v: i32(SCHEMA_VERSION),
      batch_norm: normBatch(r.batch),
      product_norm: productKey(r.product),
      mfr_norm: normMfr(r.manufacturer),
      source: r.source,
      authority: authorityOf(r.source),
      severity: i32(severity),
      list_ym: i32(ymToInt(r.list_month)),
      expiry_ym: i32(ymToInt(r.expiry_ym)),
      expiry_known: !expiryUnknown,
      dedupe: dedupeKey(r),
    },
    payload: jsonToPayload({
      product: r.product,
      batch: r.batch,
      mfg_ym: r.mfg_ym,
      expiry_ym: r.expiry_ym,
      manufacturer: r.manufacturer,
      reason: r.reason,
      lab: r.lab,
      source: r.source,
      list_month: r.list_month,
      proof: { doc: r.doc, sha256: r.doc_sha256, url: r.doc_url, row: r.row, extraction: r.extraction ?? null, retrieved_at: r.retrieved_at ?? null },
    }),
    contentType: "application/json" as const,
    // Attributes and payload can never change after creation: that is the tamper-evidence.
    // Severe alerts may be kept alive by anyone (NGOs, a health department) past the drug's expiry.
    flags: { readonly: true, permissionlessExtension: severity === 3 },
    expires: ExpirationTime.atDate(deadline, { atLeast: ExpirationTime.fromDays(1) }),
  }
}

export const REPORTER_TYPES = ["chemist", "health_worker", "parent", "inspector"] as const
export type ReporterType = (typeof REPORTER_TYPES)[number]

export function buildSightingEntity(a: {
  batch: string
  pincode: string
  reporterType: ReporterType
  seenOn: number // yyyymmdd
}) {
  const pin = Number(a.pincode)
  return {
    attributes: {
      app: APP,
      kind: "sighting",
      v: i32(SCHEMA_VERSION),
      batch_norm: normBatch(a.batch),
      pincode: i32(pin),
      pin3: i32(Math.floor(pin / 1000)),
      reporter_type: a.reporterType,
      seen_ymd: i32(a.seenOn),
    },
    // Intentionally no free text and no names: only batch, place and role.
    payload: jsonToPayload({ batch: a.batch }),
    contentType: "application/json" as const,
    flags: { readonly: true },
    expires: ExpirationTime.fromDays(SIGHTING_DAYS),
  }
}

export function ymd(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
}
