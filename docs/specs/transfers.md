# Transfers

## Purpose

Represent one atomic movement of money between Accounts or between an Account and a FixedDeposit, including the exchange rate actually realized.

## Behavior

- A Transfer is one entity with a source leg and a destination leg.
- Each leg targets exactly one Account or FixedDeposit.
- Each leg records its own integer minor-unit amount and currency.
- Each Transfer stores a purpose: `general`, `fixed-deposit-opening`, `fixed-deposit-top-up`, or `fixed-deposit-withdrawal`.
- The realized FX rate is derived from both leg amounts and their currencies' minor-unit exponents; it is not stored.
- An Account-side leg materializes as a linked Transaction so Account balance computation includes it.
- A FixedDeposit-side leg does not materialize as a Transaction.
- Both the Transfer and its Account-side ledger projections are persisted atomically.

## Invariants

- Both leg amounts are safe integer minor units.
- Every referenced Account or FixedDeposit exists.
- Each side sets exactly one of its Account and FixedDeposit references.
- Transfer-linked Transactions are derived ledger projections, not independent Transfer entities.
- Fees and FX spread are reflected in the realized rate rather than separate Transfer fee records.
- When the source leg is a FixedDeposit, the destination Account must be that FixedDeposit's `linkedAccountId` — enforced at creation, not left to the caller.
- A Transfer cannot be created with a FixedDeposit source that is not `Open`.
- A Transfer cannot be created with a FixedDeposit destination that is not `Open`.
- A withdrawal before maturity cannot exceed the FixedDeposit's current principal.

## Persistence requirements

Persistence must support creating a Transfer atomically with all required Account-side Transactions, retrieving it by identifier, deleting it, and editing it (see below). The currently generated SQLite migration does not apply the schema's declared cascade to linked Transactions, so both `delete()` and `update()` remove/replace a Transfer's linked Transactions explicitly, in the same transaction, rather than relying on that cascade.

### Editing a Transfer

A Transfer with purpose `fixed-deposit-opening` cannot be edited, nor can an edit change any other Transfer's purpose into `fixed-deposit-opening` (`TransferNotEditableError`) — an opening Transfer's amount is pinned to the FixedDeposit's frozen `originalPrincipalMinor` at creation, and FixedDeposit has no `update()` (`docs/adr/0003-fixed-deposit-maturity-inside-transfer-creation.md`: "No edit or delete") to change that baseline. Every other Transfer — `general`, `fixed-deposit-top-up`, `fixed-deposit-withdrawal` — supports a full re-edit: amounts, currencies, both legs, purpose, description, and date. An edit is implemented as an atomic replace under the same `id`: the new legs/purpose/amounts are revalidated exactly like `create()` (leg shape, purpose, amount, currency-match, FixedDeposit status/`linkedAccountId` rules), then the old linked Transactions are deleted and new ones inserted, then every FixedDeposit touched by either the old or the new legs has its principal/status recomputed from its full remaining Transfer history (the same replay `delete()` already uses) — not the incremental `+=`/`-=` `create()` uses, since the edited Transfer may no longer be the most recent one chronologically.

## HTTP and UI contract

Server Actions only. One generic form for every leg combination — no dedicated "Open FixedDeposit" or "Record Maturity" screens (`docs/adr/0003-fixed-deposit-maturity-inside-transfer-creation.md`).

- `/transfers/new` — pick a source (Account or FixedDeposit) and a destination (Account or FixedDeposit), each with its own decimal amount and currency; the realized FX rate is computed and shown on the resulting Transfer, never entered. When the source is a FixedDeposit, the destination field renders locked to that FixedDeposit's `linkedAccountId` — a UX mirror of the invariant above, which the repository enforces regardless of what the form sends.
- `TransferRepository.create()` applies FixedDeposit side effects in the same `db.transaction()`:
  - `fixed-deposit-opening`: no principal change (creation-time principal is baseline).
  - `fixed-deposit-top-up`: add destination amount to current principal.
  - `fixed-deposit-withdrawal`: subtract source amount from current principal and set status when principal reaches zero.
- Creating a Transfer sourced from a FixedDeposit that is not `Open`, with a FixedDeposit source and destination other than its `linkedAccountId`, or with invalid purpose/leg combinations is rejected before any write, alongside the existing leg-shape check (`assertValidTransferLegs`).
- `/transfers/[id]` shows both legs and the realized rate, an `Edit Transfer` link (hidden for a `fixed-deposit-opening` Transfer), and a `Delete Transfer` link. It has no standalone entry point in navigation — reached only by following a link from the Account ledger (a Transfer-linked Transaction row) or a FixedDeposit's detail page.
- `/transfers/[id]/edit` — the same form as `/transfers/new` (`TransferForm`, parameterized with an `editing` prop carrying the existing amounts/description/date), pre-selecting the Transfer's current legs and purpose; posts to `updateTransfer` instead of `createTransfer`. 404s for a `fixed-deposit-opening` Transfer.
- `/transfers/[id]/delete` — confirmation screen; always deletable, no dependent-count guard, reverting a matured FixedDeposit's status back to `Open` when applicable.

Both leg amounts are decimal-string input converted to integer minor units server-side.

## Acceptance criteria

- Account-to-Account movement creates two linked ledger Transactions with opposite signs.
- Account-to-FixedDeposit movement creates one linked Account Transaction.
- Invalid leg combinations fail before any write.
- A failed write leaves neither a partial Transfer nor partial ledger projections.
- A full withdrawal to zero before maturity marks `PrematurelyClosed`; on/after maturity it marks `Matured`.
- A FixedDeposit-sourced Transfer to an Account other than its `linkedAccountId` is rejected before any write.
- Editing a `fixed-deposit-opening` Transfer, or editing any Transfer's purpose into `fixed-deposit-opening`, is rejected before any write.
- Editing a Transfer's amount or legs correctly recomputes every FixedDeposit touched by either the old or the new legs.

## Decision record

See `docs/adr/0001-transfer-as-single-entity-with-realized-fx-rate.md`.

