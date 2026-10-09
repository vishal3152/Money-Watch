# MCP + Email Alert Sync — Gap & Issue Audit

Read-only audit of the MCP import server (`src/app/api/mcp/*`) and email alert sync
(`src/email-sync/*`, `src/app/api/cron/email-sync/*`) against `docs/specs/import.md`,
`docs/specs/email-alert-sync.md`, `docs/specs/share-trading.md`, and ADR-0009/0010/0011/0012.

No production code was changed by the initial audit pass. Findings marked **[verified]** were
reproduced by running code in this repo; findings marked **[read]** are derived from reading the
source and its migrations only.

Severity legend: **S1** breaks the feature / loses or corrupts data · **S2** wrong behaviour in a
realistic case · **S3** robustness, cost, or spec drift · **S4** cosmetic / documentation.

## Fix pass — status

A follow-up pass fixed nearly everything below with tests (TDD: a failing test reproducing the
issue, then the fix). Status per finding:

| # | Finding | Status |
|---|---|---|
| 1.1 | Poison-message crash loop | **Fixed** — `amount`/`balance` shape validated in `validateParsedEmailAlert`; poll also survives a downstream `InvalidMinorUnitsError` (e.g. JPY precision mismatch) without aborting. |
| 1.2 | Pg race not normalized | **Fixed** — `PgProcessedEmailAlertRepository.markProcessed` now maps SQLSTATE 23505 to `DatabaseConstraintError`. |
| 1.3 | No cron time budget | **Fixed** — message cap (`fetchUnseenImapMessages`'s `maxMessages`), an OpenRouter fetch timeout, a `POLL_BUDGET_MS` deadline in the cron loop, `maxDuration`, and Owner rotation via a new `lastPolledAt` column or ordering. |
| 1.4 | SQLite handle leak | **Fixed** — the daemon creates one `DrizzleDb` and threads it through every poll. |
| 2.1 | Account-number matching asymmetry | **Fixed** — `resolveAccountByNumberSuffix`/`findAccountNumberMatches` now normalize digits-only on both sides. |
| 2.2 | Institution-name spec vs. code mismatch | **Fixed** — spec reworded to match the code's exact (case-insensitive) match; no fuzzy matching added, consistent with this app's "never guess" invariant. |
| 2.3 | Cross-account-type mis-routing | **Fixed** — both `resolve_account`/`resolve_share_trading_account` now return `status: "wrong-account-type"` instead of creating a duplicate when the other entity type matches. |
| 2.4 | Spurious Discrepancies from per-alert balances | **Fixed** (per product decision — see below) — email-sourced batches never stash a closing balance/as-of date; the owner reconciles manually. |
| 2.5 | No date sanity check | **Fixed** — `isOccurredAtPlausible` rejects an alert whose claimed date is implausibly far from the email's own `Date` header. |
| 2.6 | Unresolved alerts invisible | **Fixed** (per product decision — see below) — a minimal read-only list on `/imports` (`listUnresolvedOrInvalid`). No per-row "assign to an Account" action yet. |
| 2.7 | `\Seen`-flag / folder gap | **Partially fixed** — the fetch now matches unseen (any age) *or* recent (last ~6 days) messages regardless of `\Seen`, fixing the "read on phone" bug. Folder configurability (INBOX-only today) was **not** built — INBOX is the default for the overwhelming majority of setups; flagged as a remaining gap, not attempted in this pass. |
| 2.8 | Idempotency key not stable | **Fixed** — `imapUser` lowercased at save time and at both call sites; UIDVALIDITY folded into the returned `uid` so a reset can't collide with old (mailbox, uid) rows. |
| 3.1 | No `commit_import`/`commit_stock_import` idempotency | **Fixed** — optional `idempotencyKey` on both tools; a repeat with the same key returns the existing batch. |
| 3.2 | Unbounded `source` | **Fixed** — bounded (1–200 chars) at the MCP route's Zod schema; kept free-text (not an enum) since nothing treats it as a trust signal. |
| 3.3 | No Origin validation | **Fixed** — `isAllowedOrigin` added alongside the existing Host check. |
| 3.4 | MCP tokens never expire / no rate limit | **Not done** — a real feature (expiry column + UI, plus a distributed rate limiter), out of proportion for this pass; left as a recommendation. |
| 3.5 | One bad encryption key breaks the whole cron | **Fixed** — `listAllEmailSyncCredentials` now isolates decryption failure per row (`{ ok: false }`) instead of throwing for everyone. |
| 3.6 | `openrouter_api_key` plaintext | **No action** — accepted trade-off per ADR-0012's stated scope; restated for completeness only. |
| 3.7 | Under-validated IMAP settings | **Fixed** — `imapPort` bounded to the TCP range, `pollIntervalMinutes` capped at 1440. STARTTLS/port-143 support remains unbuilt (implicit TLS only), noted as a real but lower-priority gap. |
| 3.8 | Poll-interval field dead in cloud mode | **Fixed** — hidden behind `isCloudMode`, replaced with a note about the fixed cron schedule. |
| 3.9 | Settings change needs daemon restart | **Partially fixed** — credentials are re-read every tick (no restart needed for a rotated password/key); the poll interval itself still requires a restart, and an incomplete-settings startup now logs instead of failing silently. |
| 3.10 | `listAccounts` re-queried per message | **Fixed** — hoisted above the loop. |
| 3.11 | `stableNewId`'s guard throw unhandled | **Left as-is, deliberately** — this is a programming-invariant violation, not a data problem; it should keep aborting loudly rather than being swallowed. |
| 3.12 | Local daemon breaks under `DEPLOYMENT_MODE=cloud` | **Fixed** — the daemon now pins `isCloudMode: () => false` / `getCurrentOwnerId: async () => null` regardless of the surrounding env. |
| 4.1 | Drizzle schema/migration index mismatch | **Fixed** — changed to `uniqueIndex`. |
| 4.2 | Stale schema comment (encryption) | **Fixed**. |
| 4.3 | Stale daemon comment (Electron spawns it) | **Fixed**. |
| 4.4 | Misleading imap-client idempotency comment | **Fixed** — rewritten alongside the 2.7 fix. |
| 4.5 | No `/stock-imports` review screen | **Fixed** (per product decision — see below) — minimal list + detail + confirm/undo screens mirroring `/imports`, wired to the existing tested repository methods. |

Three items (2.4, 2.6, 4.5) changed documented/spec'd behavior or added a new screen rather than
being unambiguous bugfixes; the product decision on each was confirmed before implementing.

**Not independently re-verified in this pass**: the Postgres-touching fixes (1.2, 1.3's
`lastPolledAt` migration/repository, 2.6's `PgProcessedEmailAlertRepository.listUnresolvedOrInvalid`)
were written to match the existing Postgres test suite's conventions and pass `tsc`, but this
sandbox has no reachable Postgres/Docker to actually run that suite — run it against a real
Supabase/Postgres instance before shipping.

---

## S1 — Breaks the feature

### 1.1 A non-numeric amount from the LLM poisons the mailbox forever **[verified]**

`src/domain/email-alert.ts:46` validates `amount`, `balance` as *non-empty strings only* — it never
checks they parse as decimals. The first thing that actually parses them is
`parseDecimalToMinorUnits` deep inside `ImportBatchRepository.create`
(`src/db/repositories/import-batch-repository.ts:79`), which throws `InvalidMinorUnitsError`.

`runEmailAlertSyncPoll`'s catch around `createEmailAlertImportBatch`
(`src/email-sync/run-email-alert-sync-poll.ts:129-152`) only handles `InvalidEmailAlertError` and
`DatabaseConstraintError`. `InvalidMinorUnitsError` is **rethrown**, which aborts the whole poll
pass *before* `markProcessed` runs. The message is never recorded, so every subsequent poll
re-fetches it, re-pays for an OpenRouter call, and crashes again — and every message queued behind
it in the same pass is never processed at all.

Reproduced (temporary probe test, since removed):

```
PROBE A (amount "1,282.05")     -> throws InvalidMinorUnitsError; processed_email_alerts rows: 0
PROBE B (debit + amount "-500") -> throws InvalidMinorUnitsError   // toSignedAmount yields "--500.00"
PROBE C (balance "Not available") -> throws InvalidMinorUnitsError
PROBE E (3 consecutive polls)   -> OpenRouter called 3 times for the same message
```

All three inputs are things a real LLM returns routinely against Indian bank alerts:
thousands separators (`1,282.05`), an already-signed debit amount, a currency prefix
(`INR 1282.05`), more decimals than the currency allows (`1282.056`), or a
non-null-but-unparseable balance (`"Not available"`, `"N/A"`, `"-"`).

Note `toSignedAmount` (`src/domain/email-alert.ts:94`) blindly prepends `-` for a debit, so an
LLM that already signed the amount produces `--500.00`.

**Fix direction:** validate `amount` and `balance` in `validateParsedEmailAlert` (normalize
separators/symbols, reject a sign on `amount`, then confirm both parse via
`parseDecimalToMinorUnits`) and throw `InvalidEmailAlertError`, so the message is recorded
`invalid` instead of crashing the pass. Additionally, widen the catch in
`runEmailAlertSyncPoll` so *any* per-message failure records an outcome rather than aborting
the loop — one bad email must not stall the mailbox.

### 1.2 Cloud poll crashes on the idempotency race it documents as benign **[read]**

`runEmailAlertSyncPoll.recordProcessed` (`run-email-alert-sync-poll.ts:54-68`) catches
`DatabaseConstraintError` to absorb the "two overlapping polls both processed this message" race,
and the spec's acceptance criteria say the `(ownerId, mailbox, messageUid)` uniqueness is
DB-enforced on both tiers.

The Postgres unique index does exist (`postgres/migrations/20260911020000_processed_email_alerts.sql:15`),
but `PgProcessedEmailAlertRepository.markProcessed`
(`src/db/postgres/repositories/processed-email-alert-repository.ts:34-46`) inserts **without** any
error normalization — unlike its SQLite twin, which goes through `runDatabaseWrite`
(`src/db/repositories/processed-email-alert-repository.ts:31`). The conflict surfaces as a raw
`postgres` `PostgresError` (SQLSTATE 23505), never as `DatabaseConstraintError`, so the catch
misses it and the whole owner's poll fails.

The same asymmetry breaks the crash-recovery branch at `run-email-alert-sync-poll.ts:143` for
anything that isn't already wrapped.

**Fix direction:** wrap the insert and map SQLSTATE `23505` to `DatabaseConstraintError`
(`PgImportBatchRepository` already imports `PostgresError` and matches on `"23505"` at
`src/db/postgres/repositories/import-batch-repository.ts:192` — reuse that pattern). Add a
Postgres test for a duplicate `markProcessed`; the current suite
(`src/db/postgres/repositories/processed-email-alert-repository.test.ts`) has no such case.

### 1.3 The cloud cron has no time budget — later Owners starve **[read]**

`src/app/api/cron/email-sync/route.ts:41-69` loops over **every** Owner sequentially in one
serverless invocation. There is:

- no cap on messages fetched per mailbox (`fetchUnseenImapMessages` returns the entire unseen
  INBOX, `src/email-sync/imap-client.ts:43`),
- no timeout on the OpenRouter call (`src/email-sync/openrouter-client.ts:46` uses bare `fetch`,
  which has no default timeout),
- no per-Owner deadline, and
- no `maxDuration` on the route or in `vercel.json`.

One Owner with a large unseen backlog or a slow mailbox consumes the whole function budget. Because
the loop always restarts from the first row of `listAllEmailSyncCredentials` with no ordering or
last-polled cursor, the same early Owners are polled on every run and the later ones are **never**
polled. With the shipped daily schedule (`vercel.json`, `0 8 * * *`) there is no second chance
within the day.

**Fix direction:** cap messages per poll (e.g. 50), add an `AbortSignal.timeout` to the OpenRouter
fetch, add an overall deadline that breaks the Owner loop cleanly, set `export const maxDuration`,
and order Owners by a `last_polled_at` column so the queue rotates.

### 1.4 SQLite connection leak in the local poll daemon **[read]**

`createDb()` (`src/db/client.ts:40-55`) opens a **new** `better-sqlite3` `Database` on every call
and never closes it. `resolveSqliteDb` (`src/db/repository-factory.ts:56-63`) calls it once per
repository getter whenever `deps.db` is absent — which is the case for the daemon
(`src/email-sync/start-polling.ts:38` passes no `db`).

Per message, `runEmailAlertSyncPoll` opens roughly five handles: the processed-alert repo, then
`listAccounts` (account + institution repos), then `createEmailAlertImportBatch` (account +
import-batch repos). In a long-lived `pnpm email-sync:poll` process these accumulate until the
process hits its file-descriptor limit.

**Fix direction:** create one `DrizzleDb` in `startEmailAlertSyncPolling` and thread it through
`deps.db`, the way the tests already do.

---

## S2 — Wrong behaviour in realistic cases

### 2.1 Account matching is inconsistent between its two callers **[verified]**

`resolveAccountByNumberSuffix` (`src/domain/account-number-match.ts:21`) does a raw
`candidate.accountNumber.endsWith(suffix)`. Its two callers normalize differently:

| Caller | Normalization |
| --- | --- |
| `resolveAccount` (`src/app/api/mcp/tools.ts`) | strips non-digits, takes last 4 |
| email alert sync (`run-email-alert-sync-poll.ts:94-99`) | **none** — passes the LLM's raw string |

`validateParsedEmailAlert` only trims and length-checks (≥ 4), so whatever shape the LLM emits goes
straight into `endsWith`. Verified against a stored `accountNumber` of `"XXXX1602"`:

```
suffix "XX1602"          -> resolved      (only because the stored value is masked identically)
suffix "50100123451602"  -> no-match      (LLM read the full number off the email)
institution "RBL Bank Ltd." -> no-match   (stored as "RBL Bank")
stored "5010 0123 45 1602 " + suffix "1602" -> no-match  (trailing space)
```

The stored side is never normalized either, so any account number with a trailing non-digit
(a space, a `)`, a `-`) can never match — which contradicts `docs/specs/import.md`'s invariant that
non-digits "on either side" are stripped.

Every one of these silently records the alert `unresolved`, and — per 2.6 — an unresolved alert has
no UI at all, so the transaction is simply lost.

**Fix direction:** normalize inside `resolveAccountByNumberSuffix` itself (strip non-digits from
both the claim and each candidate, compare the last 4 digits), so both callers share one rule.

### 2.2 Institution name must match exactly; the spec says "same-or-similar" **[verified]**

`account-number-match.ts:34` requires `institutionName.toLowerCase()` equality.
`docs/specs/email-alert-sync.md` describes matching "scoped to a same-or-similar institution name".
An LLM reading "RBL Bank Ltd.", "RBL BANK LIMITED", or "HDFC Bank Ltd" against a stored "RBL Bank"
/ "HDFC Bank" never matches.

**Fix direction:** either normalize a small suffix set (`ltd`, `ltd.`, `limited`, `bank`) before
comparing, or amend the spec to say exact-after-casefold — but pick one; today they disagree.

### 2.3 Alerts for non-bank accounts can import into the wrong ledger **[read]**

Email sync only ever considers `Account` rows (`run-email-alert-sync-poll.ts:94` → `listAccounts`).
`ShareTradingAccount` and `FixedDeposit` both carry their own `accountNumber`
(`src/db/schema.ts:59`, `:23`) and are invisible to it. Two consequences:

- A broker/demat or FD alert is always `unresolved` — silently dropped (2.6).
- If a bank `Account` at the *same institution* happens to end in the same four digits as the
  broker/FD account the alert is really about, it resolves to that bank Account and books a
  **stock settlement or FD interest credit as a bank Transaction**. Nothing detects this.

The same blind spot exists in MCP: `resolve_account` (`tools.ts:94`) and
`resolve_share_trading_account` (`tools.ts:405`) each search only their own table. An assistant that
reaches for the wrong tool on a broker statement silently **creates a duplicate bank Account**
instead of finding the existing `ShareTradingAccount`.

**Fix direction:** at minimum, have both resolvers check the other table and return
`status: "ambiguous"` (or a distinct `"wrong-account-type"`) rather than creating or matching. For
email sync, surface a cross-type near-miss as `unresolved` with a reason rather than importing.

### 2.4 Per-alert balances produce spurious Discrepancies **[read]**

`createEmailAlertImportBatch` (`src/email-sync/create-email-alert-import-batch.ts:37-38`) stores the
alert's claimed *available* balance as the batch's `closingBalance` with `asOfDate` = the alert's
date. On Confirm All, `ReconciliationRepository.create`
(`src/db/repositories/reconciliation-repository.ts:44`) compares it against
`computeAccountBalanceAsOf(transactions, asOfDate)` — the sum of **all** transactions on that
calendar date.

An alert's balance is an intra-day, post-this-transaction figure. Five alerts on one account in one
day produce five `BalanceSnapshot`/`Reconciliation` pairs for the same `(accountId, asOfDate)`
(there is no uniqueness constraint — `src/db/schema.ts:228`, `src/db/postgres/schema.ts:232` only
index it), four of which will show a Discrepancy that reflects nothing but intra-day ordering. Each
one demands owner attention on `/reconciliations`.

**Fix direction:** treat the claimed balance as advisory for email-sourced batches — either don't
stash it as `closingBalance` at all, or only stash it for the day's last alert per account.

### 2.5 No sanity bound on the LLM's date, and the email's own `Date` header is discarded **[verified]**

`FetchedEmailMessage` carries only `{uid, subject, body}` (`run-email-alert-sync-poll.ts:15`), and
`fetchUnseenImapMessages` drops `parsed.date` (`src/email-sync/imap-client.ts:48-52`) — verified
that `mailparser` does populate it. `assertValidCalendarDate` only checks the shape, so a
hallucinated `2025-09-09` (wrong year, a common failure on `09-09-26`-style Indian date formats) or
a far-future date is accepted and books a Transaction in the wrong period, skewing every balance
computation that follows.

**Fix direction:** capture the message's `Date` header, pass it to the LLM as context, and reject
(record `invalid`) an `occurredAt` more than a few days away from it.

### 2.6 An `unresolved` alert is silently, permanently lost **[read]**

A message recorded `unresolved` (`run-email-alert-sync-poll.ts:101-111`) is never retried and has
no review surface — the spec's own "HTTP and UI contract" says the unresolved-alert surface is
"to be determined". `/imports` (`src/app/imports/page.tsx`) lists only `ImportBatch` rows, so an
unresolved alert appears nowhere in the app and is not recoverable without reading SQL.

Given 2.1/2.2/2.3, the unresolved bucket is not an edge case — it is where most real alerts land.

**Fix direction:** at minimum, log a count per poll and surface unresolved rows on `/imports` with
a "pick an Account" action.

### 2.7 Only unseen INBOX messages are ever fetched **[read]**

`fetchUnseenImapMessages` hardcodes `INBOX` and `{seen: false}` (`imap-client.ts:41-43`). The
comment at `imap-client.ts:14-19` claims idempotency is deliberately *not* tied to the `\Seen` flag
because "the owner's own mail client could mark a message read before this app ever sees it" — but
the fetch filter is exactly that flag, so a message the owner reads on their phone first is never
imported at all. Likewise, an owner who files bank alerts into a Gmail label/folder (the normal
setup) gets nothing, since there is no folder setting.

Separately, nothing is ever marked seen, so every poll re-downloads the full source of the entire
unseen backlog (the `isProcessed` check saves the OpenRouter call, not the IMAP fetch).

**Fix direction:** make the folder configurable, and fetch by `since`/UID-greater-than rather than
`seen: false`.

### 2.8 The idempotency key is not actually stable **[read]**

The `mailbox`/id key is the decrypted `imapUser` (`start-polling.ts:39`, `cron/route.ts:44`), and
`emailAlertImportBatchId` folds it into a hash (`src/email-sync/email-alert-import-ids.ts:14`).
Three ways this breaks:

- **Casing.** Re-saving the mailbox as `Owner@Example.com` changes the key; the whole mailbox is
  reprocessed and every alert is imported a **second** time under new deterministic ids.
  `saveEmailSyncSettings` trims but does not lowercase `imapUser`
  (`src/app/settings/email-sync-actions.ts:101`).
- **UIDVALIDITY.** IMAP UIDs are unique only within a `(mailbox, UIDVALIDITY)` pair. If the server
  resets UIDVALIDITY (mailbox recreated/migrated), UIDs restart from 1 and previously-recorded UIDs
  cause **new** messages to be skipped as already processed. UIDVALIDITY is never read or stored.
- **Host change.** Same username on a different IMAP host reuses the old host's UID space, with the
  same skip-new-messages effect.

**Fix direction:** lowercase `imapUser` before using it as the mailbox key, and include the
mailbox's `UIDVALIDITY` (available on `client.mailbox` after `getMailboxLock`) in the key.

---

## S3 — Robustness, cost, and spec drift

### 3.1 `commit_import` / `commit_stock_import` are not idempotent **[read]**

Nothing dedupes a repeated `commit_import` (`tools.ts:312`). MCP here is stateless HTTP
(`route.ts:228-234`, `sessionIdGenerator: undefined`), so an assistant that retries after a dropped
response creates a second full `ImportBatch` with duplicate Transactions. `stage_import`'s duplicate
flagging is advisory only and `commit_import` does not consult it. The comment at `tools.ts:90-92`
justifying no idempotency guard ("one MCP session sequentially") does not cover transport retries.

**Fix direction:** accept an optional client-supplied idempotency key on `commit_import` and return
the existing batch on replay.

### 3.2 `source` is an unvalidated free string **[read]**

`commitImportInputShape.source` is `z.string()` (`route.ts:41`). An MCP client can write
`source: "email"` and forge an email-sourced batch, or an arbitrarily long string that the
`/imports` list renders verbatim (`src/app/imports/page.tsx:51`). Constrain it to a known set.

### 3.3 No Origin validation on the MCP endpoint **[read]**

Local mode's only guard is the `Host` header (`src/app/api/mcp/loopback-guard.ts:8`). The MCP spec
recommends validating `Origin` as well for local HTTP servers. A JSON content-type POST triggers a
CORS preflight today, so this is defence in depth rather than a live hole — but it is cheap.

### 3.4 MCP tokens never expire and are not rate-limited **[read]**

`mcp_access_tokens` stores only `tokenHash`/`createdAt` (`src/db/postgres/schema.ts:330`); there is
no `expiresAt`, no last-used tracking, and `resolveOwnerIdByTokenHash` (`route.ts:246`) is called on
every request with no throttle. The 256-bit token makes brute force impractical, but a leaked token
is valid forever and invisible — the Settings page shows only `createdAt`.

### 3.5 Encryption-key failure takes down the cron for *every* Owner **[read]**

`listAllEmailSyncCredentials` (`src/db/postgres/repositories/email-sync-settings-repository.ts:84`)
maps `rowToCredentials` over all rows, and `rowToCredentials` calls `decryptSecret`. It is invoked
**outside** the per-Owner try/catch (`cron/route.ts:37`), so a missing/rotated
`EMAIL_SYNC_ENCRYPTION_KEY` or a single undecryptable row throws before the loop starts and every
Owner's poll is skipped with a 500. The per-Owner isolation the route documents at
`cron/route.ts:59-61` does not cover this.

**Fix direction:** decrypt lazily inside the loop, or have `listAllEmailSyncCredentials` return
per-row success/failure.

### 3.6 `openrouter_api_key` is stored in plaintext while `imap_user`/`imap_password` are encrypted **[read]**

Consistent with ADR-0012's stated scope, but worth restating: a Postgres read exposes every Owner's
OpenRouter key, which is a billable credential
(`src/db/postgres/repositories/email-sync-settings-repository.ts:33`). It is also *not* masked out
of the local `settings.json`, which stores every secret in plaintext
(`src/config/database-settings.ts:31`, acknowledged in the spec).

### 3.7 IMAP settings are under-validated **[read]**

`saveEmailSyncSettings` (`src/app/settings/email-sync-actions.ts:121`) accepts any positive integer
as `imapPort` — `999999` saves fine and fails only at connect time. `imapUser` is not checked for a
plausible shape. `pollIntervalMinutes` has no upper or lower bound.

`fetchUnseenImapMessages` hardcodes `secure: true` (`imap-client.ts:31`), so a mailbox on port 143
with STARTTLS can be saved through the form and can never connect.

### 3.8 The poll-interval field is dead config in cloud mode **[read]**

`email-sync-settings-form.tsx:145` always renders "Poll every (minutes)", and the cloud path stores
it (`email-sync-actions.ts:160`), but the cloud trigger is a fixed daily cron
(`vercel.json`). A cloud Owner setting "5" gets one poll a day with no indication why.
Hide or disable the field in cloud mode and state the actual schedule.

### 3.9 Settings changes require a daemon restart, and a misconfigured daemon exits silently **[read]**

`startEmailAlertSyncPolling` reads settings once at startup (`start-polling.ts:23`). Saving new
settings in the UI has no effect until `pnpm email-sync:poll` is restarted. If settings are
incomplete, `shouldStartEmailAlertSyncPolling` returns false and the function returns with no log
and no timer — the process simply exits, giving the owner no signal at all.

### 3.10 `listAccounts` is re-queried per message **[read]**

`run-email-alert-sync-poll.ts:94` calls `listAccounts(deps)` **inside** the message loop, so a
50-message backlog runs 50 full account+institution scans (and, per 1.4, opens 100 SQLite handles).
Hoist it above the loop.

### 3.11 `stableNewId`'s guard throw is unhandled **[read]**

`run-email-alert-sync-poll.ts:123` throws a plain `Error` if more than two ids are requested. Like
1.1, that escapes the per-message catch and aborts the pass without recording anything.

### 3.12 A self-hosted Postgres deployment cannot run the local daemon **[read]**

If an operator sets `DEPLOYMENT_MODE=cloud` and runs `pnpm email-sync:poll`, `getCurrentOwnerId`
(`src/lib/supabase/current-owner.ts:23`) takes the cloud branch and calls
`createSupabaseServerClient`, which reads `next/headers` cookies — unavailable outside a request.
The daemon has no Owner to poll for and fails on the first repository call.

---

## S4 — Documentation and schema drift

### 4.1 Drizzle's Postgres schema disagrees with the migration **[read]**

`src/db/postgres/schema.ts:309` declares a plain `index("processed_email_alerts_owner_mailbox_uid_idx")`
where `postgres/migrations/20260911020000_processed_email_alerts.sql:15` creates a **unique** index
named `processed_email_alerts_owner_mailbox_uid_key`. The live database is correct; the schema file
is not. Anything generated from the schema (or a future `drizzle-kit` diff) will drop the guarantee.

### 4.2 `emailSyncSettings`' schema comment contradicts the code **[read]**

`src/db/postgres/schema.ts:313-315` says the table is "Plaintext, app-layer-filtered like every
other cloud table". ADR-0012 and `PgEmailSyncSettingsRepository` encrypt `imap_user`/`imap_password`.
Update the comment.

### 4.3 The poll daemon's header claims Electron spawns it **[read]**

`scripts/email-sync-poll-daemon.ts:8` states "desktop spawns this from electron/main.cjs".
It does not — `electron/main.cjs` contains no reference to it, and
`docs/specs/email-alert-sync.md` correctly lists this as a known gap. The comment should match the
spec.

### 4.4 `imap-client.ts`'s idempotency comment is misleading **[read]**

`src/email-sync/imap-client.ts:14-19` explains that idempotency deliberately does not depend on the
`\Seen` flag, immediately above a fetch that filters on exactly that flag (see 2.7).

### 4.5 No `/stock-imports` review UI (already-known gap) **[read]**

`commit_stock_import` (`tools.ts:622`) writes `Imported` StockTransactions, and
`StockImportBatchRepository.confirmAll()`/`delete()` exist and are tested, but nothing in
`src/app` calls them — `/imports` lists only bank `ImportBatch` rows. Imported stock trades are
stuck in `Imported` forever with no batch-level confirm or undo. Already recorded as a known gap in
`docs/specs/share-trading.md`; restated here because it is the largest functional hole on the
share-trading side of MCP.

---

## Suggested fix order

1. **1.1** — poison-message crash loop (blocks the feature outright).
2. **1.2** — cloud constraint-error normalization + a Postgres duplicate test.
3. **2.1 / 2.2** — unify account-number and institution matching in
   `resolveAccountByNumberSuffix`; this is the highest-yield accuracy fix.
4. **1.4 / 3.10** — thread one `DrizzleDb` through the daemon and hoist `listAccounts`.
5. **1.3 / 3.5** — cron time budget, message cap, OpenRouter timeout, lazy decryption.
6. **2.8** — lowercase the mailbox key and fold in UIDVALIDITY.
7. **2.5 / 2.4 / 2.7** — date sanity from the `Date` header, balance handling, folder/UID fetching.
8. **2.3** — cross-account-type resolution guard.
9. Everything in S3/S4 as cleanup.

## Test coverage gaps this audit relied on

- `src/email-sync/run-email-alert-sync-poll.test.ts` has no case for an amount or balance that
  fails to parse (1.1), nor for an LLM-signed debit amount.
- `src/db/postgres/repositories/processed-email-alert-repository.test.ts` has no duplicate-insert
  case (1.2).
- `src/domain/account-number-match.test.ts` only exercises already-normalized 4-digit suffixes —
  no masked, over-long, or trailing-whitespace candidate (2.1).
- Nothing covers the cron route's multi-Owner loop, its failure isolation, or
  `listAllEmailSyncCredentials` throwing (1.3, 3.5).
