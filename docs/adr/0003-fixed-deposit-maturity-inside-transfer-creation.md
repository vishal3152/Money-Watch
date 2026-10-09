# FixedDeposit lifecycle updates are side effects of Transfer purpose

The earlier design treated any FixedDeposit-sourced Transfer as full maturity. That model blocks two user needs: partial premature withdrawal and explicit top-up. The app now keeps one generic `/transfers/new` flow, but each FixedDeposit-related Transfer carries explicit purpose (`fixed-deposit-opening`, `fixed-deposit-top-up`, `fixed-deposit-withdrawal`) and drives principal/status side effects atomically inside `TransferRepository.create()`.

Decision details:

- `FixedDeposit` stores both immutable `originalPrincipalMinor` (baseline at creation) and mutable `principalMinor` (current principal).
- The opening Transfer records movement into the FixedDeposit but does not increase principal again; baseline principal remains the source of truth.
- Top-up Transfers increase current principal while the FixedDeposit is `Open`.
- Withdrawal Transfers reduce current principal while the FixedDeposit is `Open`, must pay to the linked Account, and cannot exceed principal before maturity date.
- When withdrawal drives principal to zero:
  - before `maturityDate` => status `PrematurelyClosed`
  - on/after `maturityDate` => status `Matured`
- Transfer deletion recomputes affected FixedDeposit principal/status from remaining Transfer history, so out-of-order deletions cannot leave stale lifecycle state.

This keeps the UX simple (single Transfer form, no dedicated maturity wizard), but makes FixedDeposit behavior explicit, auditable, and compatible with top-ups and premature withdrawals.

## Extension: currency invariant and opening debit at creation time

Two gaps surfaced after the above shipped: a FixedDeposit's `currencyCode` was a free-typed form field with no relation to its `linkedAccountId`'s actual currency, and creating a FixedDeposit never moved any money — the `fixed-deposit-opening` purpose above existed but nothing wired it into the creation flow, leaving it a rarely-used manual path.

We considered dropping `linkedAccountId` entirely and merging FixedDeposit into Account (a `kind` discriminator instead of a separate table). Rejected: `CONTEXT.md` already documents FixedDeposit as *not* accepting arbitrary Transactions — a boundary this ADR's own repository-enforced side effects depend on. Merging would require reinventing that boundary as a runtime special-case on Account instead of removing it, and Reconciliation/BalanceSnapshot (a bank-reported balance to check against) don't have an equivalent for an FD's fully-computed balance.

Decision details:

- `FixedDepositRepository.create()` now validates `input.currencyCode` against the linked Account's actual `currencyCode`, throwing `FixedDepositCurrencyMismatchError` on mismatch — enforced at the data layer, not just the form (`createFixedDeposit` derives the value from the selected Account, so the form no longer asks for a currency at all).
- `FixedDepositRepository.create()` takes an optional `openingDebit: { transferId, transactionId, description }`. When present, it writes the FixedDeposit row *and* a `fixed-deposit-opening` Transfer plus its linked Transaction in the same `db.transaction()` — the same "the repository owning a composite event reaches into whatever tables that event touches" pattern `TransferRepository.create()`/`.delete()` already establishes, rather than two repositories coordinating a shared transaction handle (which this codebase has no mechanism for).
- The debit is optional by user choice (a "Debit linked Account now" checkbox, checked by default) — not every FixedDeposit is funded through this app at the moment it's recorded.
- `TransferRepository.create()` now rejects a second `fixed-deposit-opening` Transfer against the same FixedDeposit, so skipping the debit at creation and recording it later (via a "Record opening debit" link on the FixedDeposit detail page) can't happen twice.
