# Reconciliation

## Purpose

Persist an independent comparison between an Account's computed ledger balance and a dated bank-reported BalanceSnapshot, with explicit handling of any difference.

## Behavior

- A Reconciliation compares one BalanceSnapshot with the Account balance computed through the snapshot's date.
- It records the computed balance and when the comparison was performed.
- If the snapshot and computed balance differ, the Reconciliation creates one Discrepancy.
- Discrepancy amount is `snapshot balance - computed balance`.
- A Discrepancy is `corrected-my-record`, `disputed-with-bank`, or left unresolved.
- Correcting the owner's record creates an Adjustment linked to that Discrepancy.
- An Adjustment wraps a `Confirmed` Transaction so it participates in later balance computation while remaining visibly distinct from bank activity.

## Invariants

- Reconciliation, Discrepancy, and Adjustment amounts use safe integer minor units.
- A matching Reconciliation has no Discrepancy.
- A mismatching Reconciliation has one Discrepancy.
- An Adjustment exists only in response to a specific Discrepancy.
- Correction adds history; it does not silently rewrite an earlier Transaction.

## Persistence requirements

Creating a Reconciliation must load the BalanceSnapshot and date-bounded Account Transactions, compute the balance, and atomically persist the Reconciliation plus any required Discrepancy. Creating an Adjustment must atomically persist its Transaction and Discrepancy link.

## HTTP and UI contract

Server Actions only. Reconciliation and Discrepancy screens are create-and-view plus the one supported update — resolving a Discrepancy; Adjustment has no edit.

- `/accounts/[id]/reconcile` — enter a bank-reported balance and its as-of date; this single action creates the BalanceSnapshot and immediately runs the Reconciliation against it. There is no separate "capture a snapshot" screen (`docs/specs/accounts.md`).
- `/reconciliations/[id]` — shows the reported balance (BalanceSnapshot), the computed balance, the signed difference, and, if they differ, the Discrepancy and its resolution state, without collapsing them into one figure.
- Resolving a Discrepancy is a bare three-state choice (`corrected-my-record` / `disputed-with-bank` / left unresolved) — no notes or reason field; the domain model doesn't have one, and adding one would be a schema change out of scope for this pass.
- Choosing `corrected-my-record` requires entering the Adjustment's Transaction details (decimal amount, description) in that same submit — the amount field defaults to the Discrepancy's signed amount but stays editable. A resolution of `corrected-my-record` is never saved without its Adjustment; the two are one action.

Amounts are decimal-string input converted to integer minor units server-side.

## Acceptance criteria

- Equal balances persist a Reconciliation without a Discrepancy.
- Unequal balances persist a correctly signed, initially unresolved Discrepancy.
- Resolution state can be retrieved after it changes.
- An Adjustment appears in the Account ledger and remains traceable to its Discrepancy.

