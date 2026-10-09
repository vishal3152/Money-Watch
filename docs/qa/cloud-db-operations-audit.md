# Cloud-mode DB operations audit

**Date:** 2026-09-14  
**Mode:** `DEPLOYMENT_MODE=cloud` (Next.js against Postgres via `SUPABASE_DB_URL`)  
**Out of scope:** email alert sync / IMAP, MCP import (`/api/mcp/**`, `/settings/mcp/**`, `/imports/**`, unresolved email alerts)

## Method

1. Ran the app in cloud mode (`PW_LOG_SQL=1 pnpm dev`). Unauthenticated requests redirect to `/login` — confirmed live.
2. Signed in (email/password) and navigated key routes while capturing `[sql]` lines from the Next server log.
3. Inventoried every included `page.tsx` / Server Action: `get*Repository()` calls and methods, concurrency (`Promise.all` vs sequential), and over-fetch patterns.
4. Cross-checked `Pg*` repositories under `src/db/postgres/repositories/` for multi-statement methods (counts, cascades, transactions).

**Live dataset (this Owner):** 5 institutions, 8 accounts, 1 share-trading account (3 stock txs), account “NRE” with 25 ledger rows + 1 reconciliation. No FDs / stock-import batches in this session.

Each `get*Repository()` resolves the Owner via `getCurrentOwnerId()` (React `cache` — **one Auth round trip per request**). That is not Postgres. Signed-in chrome also calls `getCurrentOwnerEmail()` in `CloudOwnerControls` — a **second** Auth `getClaims()` on every page.

Postgres pool: `max: 3` (`connection-pool.ts`). Parallel page work beyond three concurrent queries serializes behind the pool. Timestamps below show ~250ms steps when a fourth query waits.

**Next.js prefetch noise:** hovering / rendering `<Link>` targets often fires a second full dashboard (or destination) RSC render in parallel. Several navigations show **overlapping** query batches — treat isolated spans below as the clean measurements.

---

## Cross-cutting costs (every authenticated page)

| Cost | Detail |
|------|--------|
| Auth | `getCurrentOwnerId()` once/request (cached); `getCurrentOwnerEmail()` once more when header renders |
| Layout / middleware | No Paisa repository SQL |
| Factory | No SQL by itself — only constructs `Pg*` with `ownerId` |

---

## Page inventory (reads)

For each route: **repository methods** → estimated **Postgres statements**. Auth omitted.

### Dashboard — `GET /`

| Wave | Methods | SQL |
|------|---------|-----|
| 1 (parallel) | Institution / Account / FixedDeposit / ShareTradingAccount `listAll` | 4 |
| 2 (parallel) | `sumAmountsByAccountIds`, `countOpenDiscrepanciesByAccountIds`, `listByShareTradingAccountIds` | 3 |
| **Total** | | **7** |

Notes: Already batched for balances / open discrepancies / stock txs (no per-account N+1). Loads the Owner’s full entity set then groups in memory — correct for a home screen, but the heaviest cold read.

### Institutions

| Route | Methods | SQL (est.) | Issues |
|-------|---------|------------|--------|
| `GET /institutions/new` | — | 0 | |
| `GET /institutions/[id]` | `getById` + Account/FD/STA **`listAll`** (filter in JS) + `sumAmountsByAccountIds` | **5** | **Over-fetch:** three global lists for one institution |
| `GET /institutions/[id]/edit` | `getById` | 1 | |
| `GET /institutions/[id]/delete` | `getById` + `getDependentCounts` | **1 + 3 COUNTs = 4** | |

### Accounts

| Route | Methods | SQL (est.) | Issues |
|-------|---------|------------|--------|
| `GET /accounts/new` | Institution `listAll` | 1 | |
| `GET /accounts/[id]` | Account `getById`; then Institution `getById`, `listPageByAccountId`, `listMonthsByAccountId`, `sumAmountsByAccountIds([id])`, `listByAccountId` (recs), `listAdjustmentLinksByAccountId` | **1 + 6 = 7** (empty ledger page may add a COUNT) | Two waves (account first, then parallel reads). Already paginated ledger. |
| `GET /accounts/[id]/edit` | `getById` | 1 | |
| `GET /accounts/[id]/reconcile` | `getById` | 1 | |
| `GET /accounts/[id]/delete` | `getById` + `getDependentCounts` (3 COUNTs); then `listByAccountId` (all txs), `listByAccountId` (recs), `listAdjustmentLinksByAccountId`, `listByLeg`; then **N×** Account `getById` for transfer counterparties | **5–6 + N** | **Worst read hotspot:** full ledger for copy; N+1 account names |

### Transactions (under account)

| Route | Methods | SQL |
|-------|---------|-----|
| `GET .../transactions/new` | Account `getById` | 1 |
| `GET .../transactions/[id]/edit` | Account + Transaction `getById`; Adjustment `getByTransactionId` | 3 (sequential after parallel pair) |
| `GET .../transactions/[id]/delete` | same as edit | 3 |

### Transfers

| Route | Methods | SQL (est.) | Issues |
|-------|---------|------------|--------|
| `GET /transfers/new` | Account + FD + Institution `listAll` | 3 | Needed for form options |
| `GET /transfers/[id]` | Transfer `getById`; up to 4× Account/FD `getById` | **1 + ≤4** | Fine |
| `GET /transfers/[id]/edit` | Transfer `getById` + three `listAll`s | **4** | Reloads all entities for form |
| `GET /transfers/[id]/delete` | Transfer `getById`; optional FD `getById` | 1–2 | |

### Fixed deposits

| Route | Methods | SQL |
|-------|---------|-----|
| `GET /fixed-deposits/new` | Institution + Account `listAll` | 2 |
| `GET /fixed-deposits/[id]` | FD `getById`; Institution + Account `getById` + Transfer `listByLeg` | **1 + 3 = 4** |

### Share trading & stocks

| Route | Methods | SQL (est.) | Issues |
|-------|---------|------------|--------|
| `GET /share-trading-accounts/new` | Institution `listAll` | 1 | |
| `GET /share-trading-accounts/[id]` | STA `getById`; Institution `getById` + StockTx `listByShareTradingAccountId` | **1 + 2 = 3** | Full stock ledger (no pagination) |
| `GET .../edit` | STA `getById` | 1 | |
| `GET .../delete` | `getById` + `getDependentCounts` (2 COUNTs) | 3 | |
| `GET .../stock-transactions/new` | STA `getById` | 1 | |
| `GET .../stock-transactions/[id]/edit\|delete` | STA + StockTx `getById` | 2 | |
| `GET /stock-imports` | Batch `listAll` + STA `listAll` | 2 | |
| `GET /stock-imports/[id]` | Batch `getById`; STA `getById`; Institution `getById` + **all** STA stock txs, filter by `importBatchId` | **4** | **Over-fetch** — no `listByImportBatchId` |
| `GET /stock-imports/[id]/delete` | Batch + STA `getById` | 2 | |

### Reconciliations

| Route | Methods | SQL (est.) | Issues |
|-------|---------|------------|--------|
| `GET /reconciliations/[id]` | Rec `getById`; Account + Snapshot `getById` + `getDiscrepancyByReconciliationId`; then optional Adjustment + Transaction | **4–6** | Sequential chain after discrepancy |

### Login / settings (included surface only)

| Route | Paisa SQL |
|-------|-----------|
| `GET /login` | 0 |
| Sign-in / sign-up success | `upsertOwnerEmail` (1 write) — not via repository-factory |
| `GET /settings` (language / cloud lede) | 0 for included parts; page also loads email-sync UI (**excluded**) |

---

## Mutation inventory (writes) — included actions

| Action | Main repo work | Multi-SQL notes |
|--------|----------------|-----------------|
| Create/update Institution | insert / get+update | update = 2 statements |
| Delete Institution | `delete` | txn: 3 COUNTs + delete |
| Create/update Account | insert / get+update | |
| Delete Account | `delete` | txn: 3 COUNTs + delete |
| Hard-delete Account | `hardDelete` | **Heavy:** counts, recon checks, cascade deletes across adjustments → discrepancies → transfer txs → transfers → txs → import batches → recs → snapshots → account |
| Create Transaction | Account `getById` + insert | |
| Update/delete Transaction | get + adjustment check + write | 3 statements typical |
| Create/update/delete Transfer | `create` / `update` / `delete` | **Txn** with linked transactions + FD principal side effects |
| Create FixedDeposit | Account check + `create` | **Txn**; optional opening transfer+tx |
| Create/update/delete STA | CRUD + counts on delete | delete: 2 COUNTs + delete |
| Create/update StockTransaction | STA get; Sell path **`listByShareTradingAccountId`** for holdings | Over-fetch on Sell |
| Confirm stock import | `confirmAll` | get + 2 UPDATEs (**no wrapping txn**) |
| Delete stock import | `delete` | txn: delete batch txs + batch |
| Reconcile Account | Snapshot `create` + Rec `create` | Rec create: snapshot read + SUM + insert recon/discrepancy **txn** |
| Resolve discrepancy | `resolveDiscrepancy` or `resolveWithAdjustment` | adjustment path: **txn** discrepancy + tx + adjustment |

---

## Ranked hotspots

| Priority | Surface | Why it hurts in cloud |
|----------|---------|------------------------|
| P0 | `GET /institutions/[id]` | 3× `listAll` then filter — **live: 5 SQL / ~504ms**, scales with Owner portfolio |
| P0 | `GET /accounts/[id]/delete` | Full ledger select for danger-zone copy — **live: 8 SQL / ~767ms** |
| P0 | Next.js `<Link>` prefetch | Cheap routes (`/accounts/new`) often re-run a **full dashboard** (7 SQL) in parallel |
| P1 | `GET /` dashboard | **live warm: 7 SQL / ~525ms**; cold first paint ~3.3s incl. pool connect + `owner_emails` |
| P1 | `GET /stock-imports/[id]` | Loads entire STA stock ledger to show one batch (no live batch in this dataset) |
| P1 | Sell stock create/update | Full STA stock list for one-scrip sufficiency |
| P2 | `GET /accounts/[id]` | **live: 7 SQL / ~533ms**; pool `max: 3` serializes the second wave |
| P2 | `GET /share-trading-accounts/[id]` | Unbounded stock tx list — **live: 3 SQL / ~265ms** (3 rows today) |
| P2 | Transfer/FD create-edit forms | Triple `listAll` — acceptable until portfolios grow large |
| P3 | Reconciliation detail | **live: 6 SQL / ~775ms** in 3 sequential waves |
| P3 | Stock import `confirmAll` | Two UPDATEs without a transaction (correctness > latency, but fix when touching) |

---

## Optimization plan

### Phase 0 — Measure (done 2026-09-14)

Live `[sql]` timings captured after sign-in on a real Owner (Appendix A). Re-run after Phase 1 changes to confirm deltas.

### Phase 1 — Kill over-fetch (highest ROI)

**1a. Institution-scoped lists**  
Add port methods (SQLite + Postgres):

- `AccountRepository.listByInstitutionId(id)`
- `FixedDepositRepository.listByInstitutionId(id)`
- `ShareTradingAccountRepository.listByInstitutionId(id)`

Wire `GET /institutions/[id]` to these instead of `listAll` + filter.  
**Expected:** 3 large scans → 3 selective queries; same statement count, far less data / index use.

**1b. Account delete page**  
Replace full `listByAccountId` / transfer fan-out with:

- Reuse `getDependentCounts` (already present)
- Add `countByAccountId` / transfer count (or extend dependent counts)
- For hard-delete copy: `COUNT` adjustments + transfers; for names, one `listCounterpartiesByAccountId` or join — **not** N× `getById`

**Expected:** O(ledger) → O(1) statements and bytes.

**1c. Stock import batch detail**  
Add `StockTransactionRepository.listByImportBatchId(batchId)` (owner-scoped).  
**Expected:** drop full-account stock load on `GET /stock-imports/[id]`.

**1d. Sell holdings check**  
Add `sumQuantityByScripCode(shareTradingAccountId, scripCode, { excludeId? })` (or filtered list).  
Avoid full `listByShareTradingAccountId` on create/update Sell.

### Phase 2 — Round-trip shaping

**2a. Account detail wave collapse**  
Today: Account `getById` then 6 parallel reads. Options:

- Join institution name into account read for this screen, **or**
- Fire institution fetch in the same `Promise.all` as ledger queries after a single “exists” check (careful with `notFound`)

**2b. Dashboard**  
Only if Phase 0 shows pain:

- Optional: `listDashboardPayload()` single SQL / CTE returning institutions + child ids + balances + discrepancy counts (one round trip). Prefer keeping repository boundaries unless latency demands it.
- Shorter path: ensure indexes on `(owner_id)`, `(owner_id, institution_id)`, `(owner_id, account_id)`, `(owner_id, share_trading_account_id)` match the WHERE/GROUP BY shapes (verify with `EXPLAIN` on remote).

**2c. Share-trading detail pagination**  
Mirror account ledger: page stock transactions; compute holdings from a SQL aggregate (`SUM(quantity) GROUP BY scrip_code`) instead of shipping every row for holdings alone.

**2e. Prefetch control**  
For heavy routes (dashboard) linked from many pages, set `prefetch={false}` on those `<Link>`s (or only prefetch after idle) so opening `/accounts/new` does not re-query the entire portfolio.

### Phase 3 — Mutation / correctness polish

1. Wrap `PgStockImportBatchRepository.confirmAll` in a transaction.
2. Leave Transfer / FD / Reconciliation / `hardDelete` multi-SQL **inside transactions** as-is — optimize only if Phase 0 shows specific slow statements; prefer indexes over splitting txns.
3. Consider raising pool `max` only after measuring session-mode pooler headroom (today capped deliberately at 3).

### Phase 4 — Auth chrome (non-SQL but same request budget)

- Derive display email from the same claims path as `getCurrentOwnerId`, or cache `getCurrentOwnerEmail` jointly, so signed-in pages pay **one** Auth round trip.

---

## Suggested implementation order

1. Phase 0 timing capture on real data  
2. Phase 1a institution lists  
3. Phase 1b account delete page  
4. Phase 1c–1d stock import / sell  
5. Phase 2c STA pagination if ledgers are large  
6. Phase 2e prefetch={false} on dashboard links (quick win)  
7. Phase 2a/2d micro round-trip cleanups  
8. Phase 3 + 4 as drive-bys when touching those files  

Do **not** start with a mega `listDashboardPayload` until Phase 0 proves the dashboard is still the bottleneck after Phase 1.

---

## Appendix A — Live capture (2026-09-14, signed-in)

Wall-clock = first→last `[sql]` timestamp in an isolated batch (excludes Auth). Pool `max: 3` produces ~250ms stair-steps.

| Route | Paisa SQL (count) | Span | Observed statements (order) |
|-------|-------------------|------|------------------------------|
| Sign-in → first `GET /` (cold) | 1 write + 7 reads (+ `pg_type` probes) | **~3.3s** | `owner_emails` upsert; then institutions/accounts/FDs/STA `listAll` (serialized); then `sumAmounts` + `countOpenDiscrepancies` + `listByShareTradingAccountIds` in parallel |
| `GET /` warm reload | **7** | **~525ms** | 3 `listAll` at t0 → STA `listAll` +250ms → 3 aggregates at +525ms |
| `GET /institutions/[id]` (RBL) | **5** | **~504ms** | Institution `getById` + accounts/FDs `listAll` at t0 → STA `listAll` +250ms → `sumAmounts` (2 account ids) +500ms. **Confirmed over-fetch:** full Owner `listAll` for accounts/FDs/STAs |
| `GET /accounts/[id]` (NRE, 25 txs) | **7** | **~533ms** | Account `getById`; then institution + `listPage` (limit 60) + `listMonths` parallel; then sum + rec list + adjustment links |
| `GET /accounts/[id]/delete` (NRE) | **8** | **~767ms** | Account `getById` + 3 dependent `COUNT`s; then full `listByAccountId` (all 25 txs) + recs + adjustment links + `transfers.listByLeg`. No counterparty N+1 (zero transfers on this account) |
| `GET /share-trading-accounts/[id]` | **3** | **~265ms** | STA `getById` → institution `getById` + stock tx list |
| `GET /transfers/new` | **3** (+ prefetch) | **~0–760ms*** | accounts + FDs + institutions `listAll`; often interleaved with a full dashboard prefetch |
| `GET /reconciliations/[id]` | **6** | **~775ms** | Rec `getById` → (account + snapshot + discrepancy) → adjustment → transaction (**3 sequential waves**) |
| `GET /stock-imports` | **2** | **~0ms** (parallel) | batch `listAll` + STA `listAll` |
| `GET /fixed-deposits/new` | **2** | **~0ms** (parallel) | institutions + accounts `listAll` |
| `GET /accounts/new` | **1** (+ heavy prefetch) | — | Page itself: institutions `listAll`. Prefetch fired **two full dashboard** batches (~14 extra queries) in the same second |

\*When prefetch overlaps, total SQL in that second can be 10–19 statements — see Method.

### Live confirmation of hotspots

1. **Institution detail over-fetch is real** — `listAll` on accounts/FDs/STAs for the whole Owner, then filter to RBL (2 of 8 accounts).
2. **Account delete loads the full ledger** — `select ... from transactions where account_id = …` with no limit (25 rows today; will grow).
3. **Pool serialization is visible** — wave-1 of 4 `listAll`s always finishes as 3 + 1 delayed ~250ms.
4. **Link prefetch doubles work** — navigating to cheap forms (`/accounts/new`, `/transfers/new`) often re-runs the entire dashboard query set in parallel.
5. **Reconciliation detail is sequential** — ~250ms × 3 waves ≈ 775ms even for a single resolved discrepancy.

## Appendix B — How to re-capture

```bash
PW_LOG_SQL=1 pnpm dev
# Sign in at http://localhost:3000/login
# Open a route; server terminal prints:
# [sql] <iso-time> <query> -- <params>
```

Prefer hard navigations (address bar / `browser_navigate`) over clicking in-app links if measuring a single route — Next prefetch otherwise overlaps batches.

## Appendix C — Explicit exclusions

Not inventoried here (per request): `/imports/**`, email sync settings/actions/cron, unresolved email alerts, MCP tools/route/token UI, `/dev/seed`.
