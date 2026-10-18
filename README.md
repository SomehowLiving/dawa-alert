# Dawa Alert

**Is this medicine batch on a recall list?** Type or photograph the batch number and get an answer
in a second, from every official list we can find, with a record that nobody can quietly remove.

In October 2025, at least 24 children in Madhya Pradesh died after taking cough syrup contaminated
with diethylene glycol. CDSCO, several state drug controllers and WHO each issued their own alerts,
on their own sites and in their own PDFs. A chemist or a parent holding a bottle had nowhere to ask
*"is this exact batch bad?"*. Dawa Alert is that place, and it is not limited to cough syrup: it covers every
batch on CDSCO's published lists (~3,500 flagged batches since Jan 2025, of which ~2,100 are still within
their printed expiry) plus WHO's alert for the three contaminated syrups.

**Live:** https://dawa-alert.vercel.app (Tiramisu testnet). Source data and the entities it reads are public; the relay wallet that
creates sightings is listed in [arkiv/schema.md](arkiv/schema.md).

## Why Arkiv

| Need | What breaks elsewhere | What Arkiv gives |
|---|---|---|
| An alert must not be quietly deleted or edited (a manufacturer leans on the operator) | Postgres: the operator can `DELETE`. A website can be taken down. | Entities are created `readonly` (attributes and payload can never change), then ownership is sent to the burn address, so even the wallet that wrote them cannot delete them. |
| A flagged batch stops mattering when the batch expires | Postgres/IPFS: you write a cron job, or it lives forever | The entity's expiry is the batch's printed expiry date (`ExpirationTime.atDate`). It vanishes on its own. Contamination alerts live a year longer and anyone may extend them (`permissionlessExtension`), because bottles linger in cabinets. |
| Look up by a hand-typed batch number, search by name, group sightings by district | IPFS can't query; a subgraph can't expire | Typed attributes with equality, `STARTSWITH` and integer ranges: `batch_norm`, `product_norm`, `pin3`. |
| Several authorities flag the same batch independently | A single table hides who said what | One entity per (authority, batch), each with its own source document hash. The UI shows how many bodies flagged it. |
| "Where is it still being sold?" must fade if nobody re-confirms | Stale reports pile up | Sightings expire in 30 days; a repeat report `extendEntity`s the existing one. |

**Kept off Arkiv on purpose:** reporter identity, shop names, photos, free text, and the label image
(read in memory, never stored). Community reports are *sightings*, never *alerts*. See
[arkiv/schema.md](arkiv/schema.md) and [arkiv/friction.md](arkiv/friction.md).

## Data

All of it is public regulatory data about drug batches (no personal data).

| Source | How we get it |
|---|---|
| CDSCO NSQ portal (`cdscoonline.gov.in`), Jan 2025 → now | `npm run data:portal`: the portal's own JSON endpoints, one request per month with a 1 s pause. Each record keeps a SHA-256 of the exact portal row. |
| CDSCO monthly PDFs (to Jun 2025) | `npm run data:pdf`: downloads and parses the PDFs (3 different table layouts). Kept as a cross-check and tested on a fixture. |
| WHO Medical Product Alert N°5/2025 | Annex PDF, 3 batches, in `data/alerts_who.json` with the PDF's SHA-256. |
| Telangana Drugs Control Administration stop-use notices (Oct 2025) | 3 batches in `data/alerts_state.json`. The official notice PDF could not be retrieved, so each record cites a news report of it and says so (`doc` starts "Press report"). |

CDSCO moved NSQ alerts from PDFs to the portal in Aug 2025, so the PDF lists stop at June 2025.
**Check CDSCO's Copyright Policy and Terms before reusing the data**; we cite CDSCO as the source in every record.

## Run it

Needs Node ≥ 24 and Python 3 with `pdfplumber` (data refresh only).

```bash
npm install
cp .env.example .env.local        # PRIVATE_KEY (a fresh testnet key) and ARKIV_API_KEY
# fund the address at https://hub.arkiv.network/faucet  (Tiramisu testnet, chain 7738577)

npm run seed -- --dry-run         # see what would be written
npm run seed                      # writes ~2,300 alerts, locks them, publishes the dashboard snapshot
npm run dev                       # http://localhost:3000   (or: npm run build && npm start)
```

Keeping it fresh: `npm run sync` re-fetches CDSCO's portal and writes only what is new (seeding is idempotent).
The fetch refuses to replace the previous dataset if the portal returns nothing, changes shape, or the row count drops
by more than 20% (`--force` overrides). `npm run stats` republishes just the dashboard snapshot.

**Pages:** `/` the floor (check a batch, charts, recent alerts, map), `/alerts` browse and filter every live alert,
`/batch?batch=…` one batch in full, `/map` sightings, `/report` report a sighting, `/about`. English and Hindi.

**Photo reading.** "Scan the batch number" works out of the box: it reads the label *on the device* with Tesseract
(trying a few small rotations), so the photo never leaves the phone. It is only ever a **suggestion**: the guess is shown
next to the photo with a "Use this batch" button and a warning, and never fills the field by itself, because on a tilted,
curved label it drops or swaps digits (on our test bottle it read `A12` for `A1254`). Set `ANTHROPIC_API_KEY` to use
Claude vision on the server instead (more accurate; the image is forwarded once and not stored).

`PRIVATE_KEY` is the wallet that creates every Arkiv entity. Its address is shown at `/api/health`; list it on the
submission form.

## Deploy (Vercel)

```bash
vercel link --project dawa-alert
printf '%s' "$PRIVATE_KEY"     | vercel env add PRIVATE_KEY production --sensitive
printf '%s' "$ARKIV_API_KEY"   | vercel env add ARKIV_API_KEY production --sensitive
vercel deploy --prod
```

Only those two variables are required (add `ANTHROPIC_API_KEY` to read photos with Claude vision). Run `npm run seed` /
`npm run stats` locally to publish data and the dashboard snapshot; the deployed app only reads (plus the sighting relay).

## Structure

```
app/                 Next.js App Router: pages, layout, and api/*/route.ts (one-line handlers)
components/          Shell, Floor (dashboard), CheckPanel, VerdictCard, ScanCard, Gauge, Sparkline, SightingMap, …
lib/                 domain code, with tests beside it
  api.ts             the HTTP API as plain Request -> Response functions (cache, rate limit, routing)
  service.ts         every Arkiv read and write (check, search, browse, sightings, seeding)
  schema.ts          how alerts and sightings map onto Arkiv entities
  stats.ts           dashboard numbers + the published snapshot
  normalize.ts, label.ts, regions.ts, dict.ts, ocr-client.ts, …
scripts/             data fetch/parse (Python) and seed / publish-stats (Node)
data/                the mirrored public datasets, with source hashes
arkiv/               schema.md and friction.md (submission files)
```

## API

| | |
|---|---|
| `GET /api/check?batch=SR-13&product=Coldrif` | verdict: `flagged` / `possible_match` / `not_found`, matches, authorities, sightings. `not_found` never says "safe". |
| `GET /api/alerts?q=cold` | search by product-name prefix |
| `POST /api/sightings` `{batch,pincode,reporterType}` | report a sighting (gasless relay, rate-limited) |
| `GET /api/sightings/map?batch=` | sightings grouped by 3-digit pincode prefix |
| `GET /api/browse?severity=&authority=&month=&cursor=` | one filtered page of alerts |
| `GET /api/recent`, `GET /api/stats`, `GET /api/health` | recent feed, dashboard numbers, chain/relay status |

## Tests

```bash
npm test            # unit tests, next to the code in lib/: normalisation, planning, verdict logic, API, parser fixture, OCR (mocked)
npm run typecheck
npm run test:live   # lib/e2e.live.ts against Tiramisu; needs a funded PRIVATE_KEY, otherwise skips
```

The live test writes tagged entities, proves an alert cannot be deleted once locked and cannot be
edited even by its owner when unlocked, then deletes what it can.

## Limits, stated plainly

- **Mirror, not authority.** CDSCO and WHO do not sign on Arkiv; our wallet mirrors their public lists and
  each entity carries the source URL and a document/row hash so anyone can re-check it.
- **Absence is not safety.** Many bad batches are never listed. The UI says so.
- **Batch numbers collide.** Short numbers like `0081` repeat across products; the app asks for the product name
  and reports `possible_match` when only the number agrees.
- **A bad import is permanent.** An early PDF import wrote ~700 near-duplicates with mangled names ("Calc ium") and locked
  them to the burn address before we noticed. They cannot be deleted, so the API hides them (`LEGACY_SOURCES` in
  `src/schema.ts`) and the loader skips them. Lesson: verify a dataset on a throwaway wallet before locking it.
- **Corrections are new entities, not edits.** When a regulator revises or withdraws an alert, the old record stays
  (that is the point). A signed "supersedes" entity is the planned way to mark it; not built yet.
- Hindi strings were written by an AI and should be reviewed by a native speaker.
- Kerala's own monthly stop-sale orders (e.g. 41 batches in Sept 2026, per press) are not yet ingested: the department's
  official lists were not found in machine-readable form.
- Testnet only. The Tiramisu chain may be reset.

MIT licensed.
