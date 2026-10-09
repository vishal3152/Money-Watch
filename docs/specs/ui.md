# UI

## Purpose

Cross-cutting navigation, layout, and interaction conventions that apply across the other feature specs, rather than being repeated in each one. Per-entity routes and behavior live in `accounts.md`, `transactions.md`, `fixed-deposits.md`, `transfers.md`, `reconciliation.md`, and `share-trading.md`.

## Architecture

Next.js Server Actions and Server Components — no `/api` JSON routes (`docs/adr/0002-server-actions-not-rest-api.md`). Institution, Account, and Transfer support edit and delete; a manually-entered Transaction (not Transfer-linked, not an Adjustment) supports edit and delete directly, while a Transfer-linked or Adjustment-linked Transaction must be corrected through the entity that owns it (edit/delete the Transfer; nothing edits an Adjustment). FixedDeposit deliberately supports neither (`docs/adr/0003-fixed-deposit-maturity-inside-transfer-creation.md`); ShareTradingAccount/StockTransaction likewise support neither, for a different reason — nothing yet needs to revise a recorded trade (`share-trading.md`).

## Route map

```
/                                   — dashboard: Institutions, each listing its Accounts and FixedDeposits
                                      with computed balances in their own currency. No cross-currency total —
                                      no FX-conversion service exists (see docs/adr/0001). Open Discrepancies
                                      shown as a secondary badge/count, not the primary view. A "Hide
                                      zero-balance accounts" toggle (default: hidden) narrows the Account list;
                                      an Institution whose only content was hidden zero-balance Accounts drops
                                      out of view entirely rather than showing an empty section.
/institutions/new
/institutions/[id]                  — an Institution's Accounts and FixedDeposits; same zero-balance-hiding
                                      toggle as the dashboard, scoped to this Institution's Accounts
/institutions/[id]/edit             — rename
/institutions/[id]/delete           — confirmation; blocked while it still has Accounts/FixedDeposits
/accounts/new
/accounts/[id]                      — computed balance, Account-only ledger entries, Transfers, and Reconciliation history
/accounts/[id]/edit                 — name/account number (currencyCode is not editable)
/accounts/[id]/delete               — confirmation; blocked while it still has Transactions, Reconciliations, or a linked FixedDeposit
/accounts/[id]/transactions/new
/accounts/[id]/transactions/[transactionId]/edit    — manually-entered Transactions only; 404s for a Transfer-linked or Adjustment-linked one
/accounts/[id]/transactions/[transactionId]/delete  — confirmation; same manual-only restriction as edit
/accounts/[id]/reconcile            — capture a BalanceSnapshot and run its Reconciliation in one action
/fixed-deposits/new
/fixed-deposits/[id]                — current/original principal, rate, dates, status, linked Account, related Transfers, top-up/withdraw actions
/share-trading-accounts/new
/share-trading-accounts/[id]        — per-company Holdings (net quantity) and the StockTransaction ledger
/share-trading-accounts/[id]/stock-transactions/new
/transfers/new                      — one generic form for every leg combination, including FD open/maturity
/transfers/[id]                     — both legs, currencies, and the realized FX rate
/transfers/[id]/edit                — same generic form as /transfers/new; 404s for a fixed-deposit-opening Transfer
/transfers/[id]/delete              — confirmation; always deletable, no dependent-count guard
/reconciliations/[id]               — reported vs. computed balance, Discrepancy, resolution, linked Adjustment
/settings                           — choose the SQLite database file path; link to MCP setup
/settings/mcp                       — Connect AI Assistant: MCP URL, token, copy-paste client config
```

## Form conventions

- **Money**: decimal string input (e.g. "1234.56"), converted server-side to integer minor units via `getMinorUnitExponent`. Interest rates follow the same pattern (percentage input, converted to integer basis points).
- **Currency**: free-text ISO code, format-validated (3 uppercase letters) only — no fixed dropdown, per `CONTEXT.md`'s "other currencies possible."
- **Timestamps**: full date+time where the domain type is a full timestamp (`Transaction.occurredAt`); date-only where it's date-only (`BalanceSnapshot.asOfDate`).
- **Errors**: inline, field-level, via `useActionState`, wherever a thrown error maps to one field (e.g. `InvalidMinorUnitsError` → that amount field); a generic top-of-form banner otherwise (e.g. `DatabaseConstraintError` for an unknown referenced id). On validation failure, Server Actions return the submitted field values plus a `formKey` so the form remounts and restores inputs — React 19 otherwise clears the form whenever the action promise fulfills.
- **Contextual help**: action-level help affordances are used for ambiguous domain actions (income/expense vs transfer, reconciliation/discrepancy, fixed-deposit top-up/withdrawal, destructive transfer deletion). Do not add tooltip noise to plain navigation.

## Localization

- **Languages**: English (source), Simplified Chinese, Modern Standard Arabic. The active language is a `pw-locale` cookie chosen in Settings — not a URL segment — so every existing route keeps its path.
- **Copy lives in `src/i18n/messages/`**, never inline in a component. The English catalog is the source of truth; `zh`/`ar` are typed against its key set, so an untranslated key cannot compile.
- **Server Actions return message keys** (`LocalizedText = { key, params? }`), not sentences. Validation logic stays language-agnostic, and the component holding the translator renders the text. This is the same "errors are typed at the boundary" rule as **Form conventions** above, applied to copy.
- **Arabic is right-to-left**: `<html dir>` follows the locale, and the stylesheet uses logical properties (`margin-inline-start`, `text-align: start`) so mirroring falls out of CSS. Only `transform`-based affordances (the back chevron, the collapse chevron, the toggle thumb) need explicit `[dir="rtl"]` rules.
- **Money is not localized.** Amounts render as `1234.56 INR` in every language — integer minor units formatted by `format-money.ts`, Latin digits, currency code suffix. Locale-aware number/date formatting is deliberately out of scope; a per-Account currency is domain data, not a display preference.
- **Stored values stay English.** Enum values (`Confirmed`, `Buy`, category names) and written Transaction descriptions are data; only their *labels* are translated, via `trustStatus.*` / `category.*` / `stockTransactionType.*` keys.

## Out of scope for this pass

- CSV/bank-feed Transaction import — no import source is designed; `Imported` remains a valid trust status with no UI that produces it.
- FixedDeposit edit or delete (ADR-0003) — a Transfer-linked or Adjustment-linked Transaction edit/delete (corrected through the Transfer or left untouched, per "Architecture" above).
- Cross-currency net worth aggregation — would require an assumed market FX rate, which the domain model deliberately avoids (`docs/adr/0001-transfer-as-single-entity-with-realized-fx-rate.md`).

## Domain-layer prerequisites

The four repository additions identified by `BUILD_PLAN_UI.md` are implemented: FixedDeposit maturity transitions and source guards, `ReconciliationRepository.listByAccountId`, `AdjustmentRepository.getByTransactionId`, and `TransferRepository.listByLeg`.
