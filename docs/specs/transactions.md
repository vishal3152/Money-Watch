# Transactions

## Purpose

Maintain the Account ledger from which balances are independently computed.

## Behavior

- A Transaction is a recorded event that changes one Account's balance.
- Amounts are signed integer minor units.
- Each Transaction is either `Confirmed` or `Imported`.
- Valid timestamps are normalized to UTC.
- Transactions for an Account are read in chronological order, with stable ordering when timestamps match.
- An Account-side Transfer leg appears in this ledger as a Transaction linked to its Transfer.
- A manually entered Transaction carries a Category from a fixed list determined by whether it is Income or Expense (Expense: Grocery, Dining, Education, Transport, Utilities, Rent, Health, Entertainment, Other; Income: Salary, Interest, Gift, Other Income). Transfer-generated and Adjustment Transactions have no Category — they aren't user-picked income/expense events.

## Invariants

- Transaction amounts and balance totals remain safe integers.
- A Transaction references an existing Account.
- `Confirmed` means entered or reviewed by the owner; `Imported` means imported and not yet reviewed.
- Transfer-generated Transactions remain projections of their Transfer, not independently editable transfer records.
- A Transaction that is the target of an Adjustment (i.e. an Adjustment's own Confirmed Transaction) is not independently editable — it corrects a specific Discrepancy and must stay traceable to it.
- A manually-entered Transaction (not Transfer-linked, not an Adjustment) may be edited or deleted directly, since it has no other entity of record to fix it through.
- A Transaction's Category, when present, must belong to its Income/Expense kind's fixed list.

## Persistence requirements

Persistence must support creating Transactions, listing them by Account, and fetching one by id. A Transaction may be updated (amount, description, Category, `occurredAt`) or deleted, but only when it is Imported (pre-confirmation review) or is Confirmed with no `transferId` and no Adjustment referencing it — anything else (a Transfer-linked or Adjustment-linked Confirmed row) is rejected (`TransactionNotEditableError`). Transfer linkage is nullable because ordinary deposits, withdrawals, interest credits, and fees do not belong to a Transfer. Category is nullable for the same reason it's absent on Transfer/Adjustment rows.

## HTTP and UI contract

Server Actions only.

- `/accounts/[id]/transactions/new` — record a Transaction against that Account: an Income/Expense Type selector, an unsigned decimal Amount (the selector determines the persisted sign), a Category selector whose options follow the chosen Type, full date+time (`occurredAt`), description. No trust-status picker — manually entered Transactions are always `Confirmed`; `Imported` has no producing screen in this pass, since no import source is designed yet.
- The ledger on `/accounts/[id]` lists Transactions chronologically, shows each one's trust status and Category (when present), and visibly distinguishes three kinds of row: an ordinary Transaction (with an `Edit` link, since it's manually-entered), a Transfer-linked projection (links to its Transfer, no Edit/Delete), and an Adjustment (links to the Discrepancy it corrects, no Edit/Delete).
- `/accounts/[id]/transactions/[transactionId]/edit` — edits a manually-entered Transaction's Type/Category/Amount/description/date (same fields and validation as `new`, reusing `TransactionForm`); 404s for a Transfer-linked or Adjustment-linked Transaction, or one belonging to a different Account. Carries a `Delete Transaction` danger-zone link at the bottom, since Transaction has no separate detail screen of its own.
- `/accounts/[id]/transactions/[transactionId]/delete` — delete-confirmation screen for a manually-entered Transaction; 404s under the same conditions as `edit`.

Amounts are decimal-string input converted to integer minor units server-side. Timestamps use a full date+time picker, matching `occurredAt`'s precision exactly rather than defaulting a time component — the spec's ordering guarantee depends on the real time entered, not an arbitrary default.

## Acceptance criteria

- Listing one Account's Transactions returns only that Account's ledger in deterministic chronological order.
- Invalid or overflowing minor-unit values are rejected.
- Balance computation includes ordinary and Transfer-generated Transactions uniformly.

