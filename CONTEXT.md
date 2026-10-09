# Money Watch (`Paisa-Watch`)

A personal system of record for money held across multiple institutions and currencies (USD, SGD, INR and other currencies). It exists so the Owner can independently track and reconcile their own balances rather than trusting bank-reported numbers alone.

## Language

**Owner**:
The single person all of a dataset's Institutions, Accounts, FixedDeposits, Transactions, Transfers, and other records belong to. Every dataset has exactly one Owner; Owners never share data with one another, whether the dataset is self-hosted or cloud-hosted.
_Avoid_: User, Account (as a synonym for Owner — Account already names a bank Account), Tenant, Customer (a distribution/business term, not a domain concept)

**Institution**:
A bank or financial company where the owner holds one or more Accounts or FixedDeposits.
_Avoid_: Bank (as a field name)

**Account**:
A bank account held at an Institution, denominated in a single currency, with an optional bank-assigned account number, that can be freely debited or credited via Transactions.
_Avoid_: Bank, wallet

**FixedDeposit**:
A named term deposit held at an Institution with an optional bank-assigned account number, an original principal, a current principal, interest rate, maturity date, and a linked Account, always denominated in that Account's currency. The linked Account is used both ways: as the funding source when the FixedDeposit is opened (optionally, via an automatic Transfer) and as the payout destination on withdrawal or maturity. Unlike an Account, a FixedDeposit does not accept arbitrary Transactions — funding and withdrawals are recorded only through Transfers. Its lifecycle states are Open, Matured, and PrematurelyClosed.
_Avoid_: Term deposit, FD account, CD

**Transaction**:
A recorded event that changes an Account's balance — a deposit, withdrawal, interest credit, fee, or one leg of a Transfer. Every Transaction carries a trust status: Confirmed (entered or reviewed by the owner) or Imported (from an automated feed, not yet reviewed).
_Avoid_: Entry, movement

**ShareTradingAccount**:
A top-level holding, at an Institution, of shares in one or more companies, each company identified by its scrip/symbol code. Unlike an Account, it is not denominated in one money balance; its position is a set of per-company Holdings computed from its StockTransactions. It is not linked to a cash Account — share-tracking is standalone, with no cash-leg bookkeeping in this codebase.
_Avoid_: Demat account, portfolio, brokerage account

**StockTransaction**:
A recorded Buy or Sell of one company's shares (scrip/symbol code, quantity, price per unit) against a ShareTradingAccount. Distinct from Transaction, which changes an Account's money balance.
_Avoid_: Trade, order, ticker (as a synonym for scrip/symbol code)

**Holding**:
The net quantity of one company's shares (scrip/symbol code) in a ShareTradingAccount, computed by summing its StockTransactions — Buy adds, Sell subtracts. A Sell is not validated against currently-held quantity, the same way an Account's computed balance is never validated against a minimum: partial or incomplete history can make a legitimate Sell look like an oversell, so a negative or zero net quantity is valid and stays visible rather than being hidden or rejected.
_Avoid_: Position, lot

**Transfer**:
A single event moving money between two Accounts, or between an Account and a FixedDeposit (opening, top-up, or withdrawal), each side in its own currency. When currencies differ, the Transfer carries the implied FX rate actually realized.
_Avoid_: Move, internal transaction

**Adjustment**:
A Transaction tagged as the owner's own correction to their record, created only in response to the specific Reconciliation whose Discrepancy it fixes, and kept visibly distinct from Transactions that reflect real bank activity.
_Avoid_: Correction, fix

**BalanceSnapshot**:
A dated record of what a bank reports an Account's balance to be, captured by the owner for comparison against the Account's own computed balance.
_Avoid_: Bank statement, reported balance

**ImportBatch**:
A record of one AI-assisted import of transaction data into a single Account, created either by the MCP import tool from a bank statement or by email alert sync from a bank's debit/credit alert email (`docs/adr/0009-email-alert-sync-calls-llm-server-side.md`). Groups the Imported Transactions and, if a closing or available balance was captured, the BalanceSnapshot it produced, so the owner can review and confirm them together in-app or undo the import as a unit.
_Avoid_: Import, Upload

**StockImportBatch**:
A record of one AI-assisted import of stock trade data into a single ShareTradingAccount, created by the MCP import tool from a broker statement/confirmation. Groups the Imported StockTransactions so the owner can review and confirm them together, or undo the import as a unit. Deliberately a separate entity from ImportBatch, not the same one reused — a stock trade has no closing-balance concept, so there is no BalanceSnapshot/Reconciliation equivalent to produce on confirm (`docs/specs/share-trading.md`).
_Avoid_: Import, Upload (same reasoning as ImportBatch)

**Suspected Duplicate**:
A flag set automatically at import time on a Transaction or StockTransaction, pointing at the earliest existing Transaction/StockTransaction on the same Account or ShareTradingAccount it appears to repeat — matched by a statement-supplied reference number when both sides have one, otherwise by date and amount (and, for a StockTransaction, scrip code, type, and quantity). When a newly imported item matches more than one existing record, it flags against the earliest of them, not the most recent, so the flag still points at the presumed original even if a later duplicate in the chain is later dismissed or removed. The owner resolves it by either dismissing it (kept as a separate, real Transaction) or removing it (deleted). An ImportBatch or StockImportBatch cannot be confirmed while any of its Transactions/StockTransactions still carries an unresolved Suspected Duplicate.
_Avoid_: Possible duplicate, duplicate flag (as the field/status name — use Suspected Duplicate)

**Reconciliation**:
A persisted record comparing an Account's BalanceSnapshot against its computed balance from logged Transactions on a given date, capturing any resulting Discrepancy.
_Avoid_: Balance check

**Discrepancy**:
A flagged mismatch, found during a Reconciliation, between a BalanceSnapshot and the balance computed from an Account's logged Transactions. Resolved as corrected-my-record, disputed-with-bank, or left unresolved.
_Avoid_: Error, mismatch
