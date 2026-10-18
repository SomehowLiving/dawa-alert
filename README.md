<p align="center"><img src="public/mark.svg" width="72" alt="Dawa Alert logo"></p>

# Dawa Alert: the warning existed. It just never reached the bottle.

Do you remember the cough syrup deaths of 2025? Or the infant deaths in Jammu and Kashmir a few years before?
Every time, the warning was already out there somewhere. It just never reached the person holding the bottle.

**Dawa Alert** lets anyone check a medicine batch against every official recall and quality alert we can find.
Type or photograph the batch number and get an answer in a second, from a record that nobody can quietly remove.

**Live:** https://dawa-alert.vercel.app (Arkiv Tiramisu testnet) · **Demo video:** _link_ · **Licence:** MIT

![Home: check a batch, scan a label, live stats](assets/home.png)

## The problem

In October 2025, at least 24 children in Madhya Pradesh died after taking cough syrup contaminated with diethylene glycol.
CDSCO, state drug controllers and WHO each published their own notices, in different places and formats, mostly as PDFs.
A parent, patient or chemist has no simple way to ask "is this batch flagged?", and a notice that can be edited or removed
cannot be fully trusted. The data exists. Access is the problem.

Dawa Alert keeps every authority's notice for a batch **side by side, with its source link and date**: 2,336 live alerts today,
from CDSCO, state drug labs and controllers, and WHO. Community sightings show where a flagged batch is still on shelves.
It works in English and Hindi, in light and dark mode, on a phone.

The full set of cases we built this around (Coldrif 2025, COLDBEST-PC 2020, Gambia 2022 and more) is in [docs/cases.md](docs/cases.md).

| | |
|---|---|
| ![A flagged batch: verdict card with source, expiry and Arkiv lock](assets/flagged.png) | ![Every live alert, filterable by type, authority and month](assets/alert.png) |
| **A flagged batch.** The authority, the reason and the source, marked "Unchangeable on Arkiv". | **Every live alert.** Browse and filter by type, authority and month. |

## Why Arkiv

A normal database has an administrator, and an administrator can be asked to remove a record. For a safety notice that is the wrong default.

| Need | What breaks elsewhere | What Arkiv gives |
|---|---|---|
| A notice must not be quietly edited or deleted | Postgres: the operator can `DELETE`. A website can be taken down. | Entities are created `readonly`, then ownership goes to the burn address, so even our own wallet cannot delete them. |
| A flagged batch stops mattering when it expires | You write a cron job, or it lives forever | Each alert expires with the batch's printed expiry date (`ExpirationTime.atDate`). Contamination alerts can be extended by anyone (`permissionlessExtension`). |
| Look up by batch number, search by name, group by region | IPFS can't query; a subgraph can't expire | Typed attributes with equality, `STARTSWITH` and integer ranges. |
| Several authorities flag the same batch | One table hides who said what | One entity per authority and batch, each with its own source hash. |
| "Where is it still sold?" must fade | Stale reports pile up | Sightings expire in 30 days. A repeat report extends the existing one (`extendEntity`). |

**Kept off Arkiv on purpose:** reporter names, shop names, photos, free text, and the label image, which is read in memory and never stored.
Schema: [arkiv/schema.md](arkiv/schema.md) · What we hit building it: [arkiv/friction.md](arkiv/friction.md)

![The alert's Arkiv entity in the data explorer: readonly, owner 0x…dEaD, attributes and expiry](assets/arkiv.png)

## How it works

- **Check a batch.** Type it, or scan the label. Scanning runs **on the device** (PaddleOCR in the browser, Tesseract as a fallback), so the photo never leaves the phone. The result is only a suggestion you confirm. An optional "Try AI reading" button sends one photo to a vision model, only if you click it. Details: [docs/photo-reading.md](docs/photo-reading.md).
- **Read the verdict.** `flagged`, `possible_match` or `not_found`. Not found never means "safe". Every Arkiv record links to the data explorer.
- **Report a sighting.** A chemist or health worker reports where a flagged batch is on sale: batch, pincode and role only. The map groups reports by the first three digits of the pincode.

## Data

Everything is public regulatory data about drug batches, with no personal data. Each record keeps its source URL and a SHA-256 of the exact row or document.

| Source | How we get it |
|---|---|
| CDSCO NSQ portal, Jan 2025 → now | `npm run data:portal`: the portal's JSON endpoints, one request a month. |
| CDSCO monthly PDFs, to Jun 2025 | `npm run data:pdf`: downloads and parses three table layouts. A cross-check. |
| WHO Medical Product Alert N°5/2025 | Three batches in `data/alerts_who.json`. |
| Telangana DCA stop-use notices, Oct 2025 | Three batches in `data/alerts_state.json`. They cite a press report, because the official PDF could not be retrieved. |

Check CDSCO's copyright terms before reusing the data. We cite CDSCO as the source in every record.

## Run it

Needs Node 24 or newer, and Python 3 with `pdfplumber` (data refresh only).

```bash
npm install
cp .env.example .env.local        # PRIVATE_KEY (a fresh testnet key) and ARKIV_API_KEY
# fund the address at https://hub.arkiv.network/faucet  (Tiramisu testnet, chain 7738577)

npm run seed -- --dry-run         # see what would be written
npm run seed                      # writes ~2,300 alerts, locks them, publishes the dashboard snapshot
npm run dev                       # http://localhost:3000
```

`npm run sync` re-fetches CDSCO and writes only what is new (seeding is idempotent). `npm run stats` republishes the dashboard snapshot.
`PRIVATE_KEY` is the wallet that creates every Arkiv entity, and its address is shown at `/api/health`.

```bash
npm test             # unit tests: normalisation, planning, verdict logic, API, parser, OCR (mocked)
npm run typecheck
npm run test:live    # end-to-end against Tiramisu; needs a funded PRIVATE_KEY, otherwise skips
```

## Deploy (Vercel)

```bash
vercel link --project dawa-alert
printf '%s' "$PRIVATE_KEY"    | vercel env add PRIVATE_KEY production --sensitive
printf '%s' "$ARKIV_API_KEY"  | vercel env add ARKIV_API_KEY production --sensitive
printf '%s' "$GEMINI_API_KEY" | vercel env add GEMINI_API_KEY production --sensitive   # optional: AI reading
./scripts/deploy.sh
```

Use `scripts/deploy.sh` instead of a bare `vercel deploy`. On the Hobby plan Vercel blocks any deployment whose commit author it can't map to a team member.
The script builds locally and uploads the output from a copy with no `.git`. With the GitHub integration, commit using the numeric no-reply address (`ID+username@users.noreply.github.com`).

## Project layout

```
app/          Next.js App Router: pages and api/*/route.ts (one-line handlers)
components/   Shell, Floor, CheckPanel, VerdictCard, ScanCard, SightingMap, …
lib/          domain code with tests beside it: api, service (every Arkiv read and write), schema, stats, label, …
scripts/      data fetch and parse (Python), seed and publish-stats (Node), deploy
data/         the mirrored public datasets, with source hashes
arkiv/        schema.md and friction.md
docs/         cases and photo reading
```

## API

| | |
|---|---|
| `GET /api/check?batch=SR-13&product=Coldrif` | verdict: `flagged`, `possible_match` or `not_found`, with matches and sightings |
| `GET /api/alerts?q=cold` | search by product-name prefix |
| `GET /api/browse?severity=&authority=&month=&cursor=` | one filtered page of alerts (`cursor` is an offset such as `o:40`) |
| `POST /api/sightings` `{batch,pincode,reporterType}` | report a sighting (gasless relay, rate-limited) |
| `GET /api/sightings/map?batch=` | sightings grouped by 3-digit pincode prefix |
| `GET /api/recent`, `/api/stats`, `/api/health` | recent feed, dashboard numbers, chain and relay status |

## Limits, stated plainly

- **Mirror, not authority.** CDSCO and WHO don't sign anything on Arkiv. Each entity carries its source URL and a hash so anyone can re-check it.
- **Absence is not safety.** Many bad batches are never listed, and the UI says so.
- **Batch numbers collide.** Short numbers like `0081` repeat across products, so the app asks for the medicine name and reports `possible_match` when only the number agrees.
- **A bad import is permanent.** An early PDF import locked about 700 near-duplicates with mangled names to the burn address. They can't be deleted, so the API hides them (`LEGACY_SOURCES` in `lib/schema.ts`). Lesson: test a dataset on a throwaway wallet before locking it.
- **Alerts leave the live index when the batch expires.** That is deliberate, but it is not an audit archive. Each record links to the original public notice.
- **Corrections are new entities, not edits.** A signed "supersedes" entity is planned, not built.
- **The scanner only suggests.** It can drop or swap digits, so the user always confirms.
- Hindi strings were written by an AI and need a native speaker's review. Kerala's stop-sale orders aren't ingested yet. Testnet only: the chain may be reset.

## Built with

Next.js, React, Tailwind, [Arkiv SDK](https://github.com/arkiv-network/arkiv-sdk-js), viem, Leaflet and OpenStreetMap, PaddleOCR and Tesseract.js (Apache-2.0), pdfplumber. Data from CDSCO, WHO and Telangana DCA public notices.

MIT licensed.
