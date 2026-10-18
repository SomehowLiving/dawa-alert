# Friction report: building Dawa Alert on Arkiv (SDK 0.8.1, Tiramisu testnet)

Each item says what happened, how to reproduce it, and what would have helped.
Items marked **[live]** were observed against the Tiramisu RPC; the rest were observed in the
SDK package or the docs site.

## 1. `ne()` is exported by the SDK but the node rejects `!=` with an opaque error  [live]
- `import { ne } from "@arkiv-network/sdk/query"`; `render(ne("a","b"))` gives `a != str('b')`.
- `publicClient.select({key:true}).where(ne("app","zzz")).limit(1).fetch()` throws
  `Query rejected (type, -32002): Requested resource not available.. Query: app != str('zzz')`.
- The Fundamentals page says there is no `!=` and to write `NOT (attr = value)`, so the node is
  right and the SDK helper is the surprise. Nothing in the error names the operator.
- **Help:** have `ne()` emit `NOT (a = b)`, or remove it; and make `-32002` say "operator `!=` is not supported".

## 2. The README's example private key has no funds  [live]
- The SDK README suggests `0x3d05…7a5e` "for quick testing". Its Tiramisu balance is `0`
  (`publicClient.getBalance`), so the first write in the tutorial cannot succeed.
- **Help:** drop the key or say plainly that it is unfunded.

## 3. No scriptable way to fund a key  [docs]
- The faucet (`hub.arkiv.network/faucet`) is a web page behind a wallet connection; the docs list
  no HTTP endpoint. A CI job or an agent working in a terminal cannot top up its own test wallet,
  so live tests need a human in the loop.
- **Help:** a documented faucet endpoint (rate-limited per address) or a CLI command.

## 4. The most useful tamper-evidence features are not in the quick-start  [docs]
- `createEntity({ flags: { readonly: true, permissionlessExtension: true } })`, `executeBatch`
  (many creates, patches, deletes, extensions and ownership changes in one transaction) and
  `changeOwnership` are not on the Installation page. They are only discoverable by reading the SDK
  source under `node_modules/@arkiv-network/sdk/src`.
- These are what make "a record that cannot be edited afterwards" real, which is Arkiv's headline
  claim, so they deserve a worked example.

## 5. Three vocabularies for expiry  [docs]
- The Fundamentals page talks about an "expiration block", the Installation page uses
  `expires: ExpirationTime.fromHours(1)`, and the thing a product like this actually needs,
  `ExpirationTime.atDate(date)` ("expires on the date printed on the box"), appears only in the
  SDK's JSDoc. One paragraph tying the three together would have saved a read of the source.

## 6. No `payloadToJson` to pair with `jsonToPayload`
- `jsonToPayload(obj)` exists; its inverse is only available as `entity.toJson()` on a *query
  result*. Code that builds a payload and wants to test it has to hand-roll `TextDecoder` + `JSON.parse`.

## 7. Expired entities disappear silently  [docs]
- By design (Fundamentals): no event is emitted when an entity expires. A product built around
  expiry therefore cannot push "this alert has now expired" or "this sighting lapsed"; it can only
  notice on the next query. Dawa Alert works around it by never caching alerts.

## 8. README tutorial pins an old version
- The README's sample `package.json` shows `"@arkiv-network/sdk": "^0.6.0"` while the published
  package is 0.8.1. Minor, but it reads as if the tutorial was not re-run.

## 9. Anonymous query budget runs out, and the SDK hangs instead of saying so  [live]
- After about an hour of building (a seed that checks for existing entities, a few hundred test queries),
  every `publicClient.select(...).fetch()` stopped returning. No error: the call hung for 100+ seconds.
- Calling the RPC directly showed why:
  `curl --json '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":[...]}' https://rpc.tiramisu.db-chain.testnet.arkiv.network`
  returns `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`.
  That body has no JSON-RPC `result`/`error` envelope, so the SDK's transport treats it as a failed response and
  retries; the real message never surfaces.
- The budget is not mentioned in the quick-start, the Tiramisu connection details, or the SDK README.
- **Help:** (a) return a proper JSON-RPC error (`{"jsonrpc":"2.0","error":{"code":...}}`) so the SDK can throw it;
  (b) document the anonymous budget and say that building anything non-trivial needs a key;
  (c) have the SDK accept an API key option (we pass `X-API-KEY` via viem's `fetchOptions`).

## 10. Cursor walks die after about five pages, with a self-contradicting error  [live]
- Paging through ~2,400 matching entities with `limit(200)`, `result.next()` fails on the **6th** page:
  `Query rejected (cursor, -32005): Request exceeds defined limit.. cursor belongs to a different query, block or select`.
  The chain had not advanced (checked), so the second half of that message is wrong.
- Smaller pages do not help: `limit(100)` and `limit(50)` also fail on page 6. So the cap is on pages per walk (about 5),
  not rows, and `for await (const e of client.select(...).where(...))` simply stops with that error part-way.
- A range that *looks* small can still trip it (a 3-month `list_ym` range failed).
- Workaround that is robust whatever the rule is: walk a numeric attribute range and, on `-32005`, split the range in
  half and retry (see `collectAlerts` in `src/service.ts`, with a test that simulates the cap).
- **Help:** document the page cap next to `hasNextPage()`; fix the error text; consider a count-only query
  (`select({}).count()`), since we sometimes only need totals.

## 11. String attributes are capped at 128 bytes, found only at write time  [live]
- 69 of ~4,260 real records have a product name longer than 128 bytes, so their writes failed with
  `Invalid str value "...": 172 UTF-8 bytes exceeds the 128-byte limit on a str. Store the long form in the entity payload`.
  The message is clear and the advice is right; the limit just is not in the Fundamentals page we read.
- A batch containing one bad entity fails as a whole; we isolate the bad record by halving the batch.
- **Help:** list the per-attribute limits (128 B string, 32 attributes, 128 KiB payload) in one table, and let
  `executeBatch` report *which* create failed.

## 12. Numbers from this build (Tiramisu testnet, SDK 0.8.1)  [live]
- **Batch size:** 25 creates per `executeBatch` worked every time; 100 `changeOwnership` per batch also worked.
- **Cost:** about 0.00018 GLM per entity (50 alerts + their ownership transfers cost 0.0089 GLM); the whole
  2,466-alert dataset cost about 0.45 GLM.
- **Throughput:** ~2,450 alerts written, including the ownership transfers, in a few tens of minutes (about 20 by our estimate; we did not time it precisely).
- **Burn-address ownership transfer** inside a follow-up batch is accepted, and afterwards `deleteEntity` by the
  writer is rejected (covered by `tests/live/e2e.test.ts`).
- **`readonly: true`** rejects `patchEntity` even from the owner (same test).
- **Write-then-read visibility:** in every live test a new entity became queryable within the test's 40 s polling window (we poll every 2 s; we did not measure the exact delay).
- **Fast query:** `app = ... AND kind = ... AND batch_norm = ...` returns in about 0.5 s, including for a three-authority batch.

## 13. Locking to a burn address makes a bad import permanent  [live]
- We sent every alert's ownership to `0x…dEaD` right after creating it (the point: nobody can delete it). Hours later we found
  ~700 of them were low-quality duplicates from an early PDF import. They are `readonly` and un-owned, so they can neither be
  edited nor deleted; they live until their expiry. The only remedy is to hide them in the application.
- This is Arkiv working as designed, but nothing in the docs warns that `changeOwnership` to a dead address is a one-way door.
- **Help:** a documented "dry run" pattern (create on a scratch key, inspect, then re-create), or a short warning next to
  `changeOwnership`/`readonly`.
