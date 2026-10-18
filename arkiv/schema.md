# Arkiv schema

Every Dawa Alert entity carries `app = "dawa-alert"` and `v = 1` so it can be told apart from other
builders' data on the same chain. All entities are created `readonly`: their attributes and payload
can never change.

## `kind = "alert"`: one recalled / sub-standard batch, from one authority

| Attribute | Type | Meaning |
|---|---|---|
| `batch_norm` | str | batch number, upper-cased, non-alphanumerics removed (`SR-13` → `SR13`). The lookup key. |
| `product_norm` | str | product name, lower-cased words, clipped to 100 chars (Arkiv caps a string attribute at 128 bytes). Used with `STARTSWITH` for search. |
| `mfr_norm` | str | manufacturer, first five words, lower-cased. Search by maker. |
| `source` | str | `who`, `cdsco_portal_nsq`, `cdsco_portal_state_nsq`, `cdsco_portal_spurious`, `cdsco_nsq`, `cdsco_state_nsq`, `cdsco_spurious` |
| `authority` | str | `WHO`, `CDSCO`, or `State drug lab`. Several authorities on one batch is the signal. |
| `severity` | i32 | 3 = contamination that has killed people (DEG/EG), 2 = spurious, 1 = not of standard quality |
| `list_ym` | i32 | month the alert was published, `YYYYMM` |
| `expiry_ym` | i32 | printed expiry of the batch, `YYYYMM` (0 if unknown) |
| `expiry_known` | bool | false when the source gave no usable expiry; a 180-day default lifetime is used |
| `dedupe` | str | hash of authority + batch + product, so re-seeding never duplicates |

**Payload** (`application/json`): the verbatim row: `product`, `batch`, `mfg_ym`, `expiry_ym`,
`manufacturer`, `reason`, `lab`, `list_month`, and `proof` = `{ doc, sha256, url, row }` so anyone can
re-check the alert against the regulator's own document. No personal data: these are public
regulatory lists about drug batches.

**Lifetime.** The entity expires when the batch's printed expiry month ends (`ExpirationTime.atDate`).
Severity-3 alerts live one year longer, because contaminated bottles sit in home cabinets past the
printed date, and are created with `permissionlessExtension` so anyone (an NGO, a health department)
can keep them alive.

**Ownership.** After creation, ownership of every alert is transferred to the burn address
`0x000000000000000000000000000000000000dEaD`. The wallet that wrote an alert can then no longer
delete it, so a manufacturer cannot get an alert quietly removed by leaning on the operator. Only
severity-3 alerts can still be extended (by anyone, see above); the rest expire on schedule.

## `kind = "sighting"`: a recalled batch seen on a shelf

| Attribute | Type | Meaning |
|---|---|---|
| `batch_norm` | str | as above |
| `pincode` | i32 | 6-digit Indian pincode |
| `pin3` | i32 | first 3 digits, roughly a postal district; the heat-map grouping key |
| `reporter_type` | str | `chemist`, `health_worker`, `parent`, `inspector` |
| `seen_ymd` | i32 | `YYYYMMDD` |

**Payload:** `{ "batch": "<as typed>" }`. There is deliberately **no free text and no names**.

**Lifetime:** 30 days. A repeat report for the same batch + pincode `extendEntity`s the existing
sighting instead of adding a duplicate, so a sighting that nobody re-confirms disappears by itself.

## `kind = "stats"`: the dashboard snapshot

One small entity (`asof` string attribute, JSON payload of the counts) written by `npm run seed` / `npm run stats` and read by
`/api/stats`. It expires after 3 days; each sync writes a new one. Walking all ~2,300 alerts takes tens of seconds because the
node limits cursor depth, so the site reads this one entity instead (live counting is the fallback).

## Wallets that create entities (Tiramisu, chain 7738577)

| Role | Address |
|---|---|
| Relay / seed wallet (creates alerts, sightings, stats) | `0x182D1160966A15F0289F9d79Dd862d2010EEe3ac` |
| Burn address that receives ownership of every alert | `0x000000000000000000000000000000000000dEaD` |

## What is kept off Arkiv, on purpose

- Reporter identity, phone numbers, shop names, photos.
- The OCR image of a label (processed in memory by the client, never stored).
- Any alert from an unofficial source: community reports are *sightings*, never *alerts*.
- Aggregates (district counts, stats) are computed from queries and cached in memory; they are not stored.

## Queries the app runs

```
app = 'dawa-alert' AND kind = 'alert'    AND batch_norm = 'SR13'             -- check a batch
app = 'dawa-alert' AND kind = 'alert'    AND product_norm STARTSWITH 'cold'  -- search
app = 'dawa-alert' AND kind = 'sighting' AND batch_norm = 'SR13'             -- where is it still sold
app = 'dawa-alert' AND kind = 'sighting' AND batch_norm = ... AND pincode = ...  -- renew vs create
```
