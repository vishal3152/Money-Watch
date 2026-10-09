# Fixed Deposit — Manual Test Cases

Scope: everything a user can do to a `FixedDeposit` through the UI — create it, fund it
(opening debit), top it up, withdraw from it, view it, reach it from other screens, and
delete the records around it.

Source of truth for expected behavior, in priority order:

1. `docs/specs/fixed-deposits.md`
2. `docs/specs/transfers.md`
3. `docs/adr/0003-fixed-deposit-maturity-inside-transfer-creation.md`
4. `CONTEXT.md` (domain language)

Where a case has no answer in those documents, it is tagged **[beyond-spec]** and the
"Expected" column states the behavior a competent personal-finance product must have.
These are the cases most likely to find real defects, because nothing in the requirements
forced anyone to think about them.

## Environment

- `DATABASE_PATH=/tmp/pw-qa/qa.db pnpm dev --port 3111`
- Start every block from a clean database unless the case says otherwise.
- "Today" in the reference run: **2026-09-05**. Cases that depend on past/future use
  explicit dates relative to that.

## Fixtures

| Name | What |
| --- | --- |
| `INST-A` | Institution "HDFC Bank" |
| `INST-B` | Institution "DBS Singapore" |
| `ACC-INR` | Account at `INST-A`, name "HDFC Savings", currency `INR` |
| `ACC-INR2` | Account at `INST-A`, name "HDFC Current", currency `INR` |
| `ACC-USD` | Account at `INST-A`, name "HDFC USD", currency `USD` |
| `ACC-B-INR` | Account at `INST-B`, name "DBS INR", currency `INR` |
| `FD-OPEN` | FD at `INST-A`, linked `ACC-INR`, principal 100000.00, rate 7.25%, opened 2026-01-01, matures 2027-01-01 |
| `FD-MATURED` | as `FD-OPEN` but matures 2026-03-01 and fully withdrawn on 2026-03-02 |
| `FD-PAST` | FD linked `ACC-INR`, principal 50000.00, opened 2025-01-01, matures **2026-06-01** (already past maturity, still Open) |

Seed accounts with a large opening income transaction (e.g. 1,000,000.00) before FD work so
balance assertions are meaningful.

---

## 1. Create FixedDeposit — `/fixed-deposits/new`

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-CREATE-01 | P0 | `INST-A`, `ACC-INR` exist | Principal `100000`, rate `7.25`, opened `2026-01-01`, matures `2027-01-01`, "Debit linked Account now" checked. Save. | Redirects to `/fixed-deposits/<id>`. Current and original principal both ₹1,00,000.00. Rate shows 7.25%. Status `Open`. An opening Transfer is listed. `ACC-INR` balance dropped by exactly 100000.00 and its ledger shows a `Confirmed` debit linked to that Transfer. |
| FD-CREATE-02 | P0 | same | Same as above but **uncheck** "Debit linked Account now". Save. | FD created with principal 100000.00; **no** Transfer listed; `ACC-INR` balance unchanged; detail page offers "Record opening debit". |
| FD-CREATE-03 | P0 | no Institution exists | Open `/fixed-deposits/new` | Empty-state card, "Add institution" CTA, no broken form. |
| FD-CREATE-04 | P0 | `INST-A` exists, no Account | Open `/fixed-deposits/new` | Empty-state card, "Add account" CTA. |
| FD-CREATE-05 | P0 | fixtures | Principal `abc` | Field error "Enter a valid principal amount."; nothing persisted; other typed values ideally preserved. |
| FD-CREATE-06 | P0 | fixtures | Principal `100.999` (3 dp on a 2-dp currency) | Rejected as invalid — must not silently round or truncate. |
| FD-CREATE-07 | P0 | fixtures | Principal `-5000` | **Fixed.** `createFixedDeposit`/`updateFixedDeposit` reject `principalMinor <= 0` with "Principal must be greater than zero." |
| FD-CREATE-08 | P1 | fixtures | Principal `0` | **Fixed.** Same `principalMinor <= 0` guard as FD-CREATE-07 rejects zero principal too. |
| FD-CREATE-09 | P1 | fixtures | Principal `99999999999999999999` | Rejected (overflow), not persisted as a wrong number. |
| FD-CREATE-10 | P0 | fixtures | Rate `-1` | Rejected, "Enter a non-negative percentage." |
| FD-CREATE-11 | P1 | fixtures | Rate `7.125` (3 dp) | Rejected — basis points hold 2 dp. Must not truncate to 7.12%. |
| FD-CREATE-12 | P1 | fixtures | Rate `0` | Accepted; detail shows `0.00%`. |
| FD-CREATE-13 | P2 | fixtures | Rate `500` (500%) | **[beyond-spec]** Either rejected as implausible or accepted and rendered correctly as `500.00%` — must not render garbled. |
| FD-CREATE-14 | P0 | fixtures | Opened `2026-01-01`, matures `2026-01-01` | Rejected: "Maturity date must be after the opening date." |
| FD-CREATE-15 | P0 | fixtures | Opened `2027-01-01`, matures `2026-01-01` | Rejected, same message. |
| FD-CREATE-16 | P0 | fixtures | Leave opening date empty and submit (form has `noValidate`) | Field error, no crash, nothing persisted. |
| FD-CREATE-17 | P1 | fixtures | Opened `2030-01-01`, matures `2031-01-01` | **[beyond-spec]** Far-future opening date should be rejected or warned. Note the side effect: with "debit now" checked the opening debit is dated 2030 yet is included in today's account balance. |
| FD-CREATE-18 | P1 | fixtures | Opened `1900-01-01`, matures `1901-01-01` | **[beyond-spec]** Implausible past date; rejected or warned. |
| FD-CREATE-19 | P0 | `ACC-USD` selected | Principal `1000`, save | FD currency is `USD` (derived from the Account, not typed). Detail shows `$1,000.00`. Opening debit hits `ACC-USD`, not any INR account. |
| FD-CREATE-20 | P0 | `INST-A` + `ACC-B-INR` (account at `INST-B`) | Select Institution `INST-A`, linked Account `DBS INR`, save | **[beyond-spec]** Should be rejected or the Account list should be filtered to the selected Institution. Currently a cross-institution FD is created; `INST-A`'s page lists the FD while the funding debit appears under `INST-B` — the dashboard no longer adds up per institution. |
| FD-CREATE-21 | P1 | fixtures | Watch the Linked Account `<select>` while switching Institution | **[beyond-spec]** Account options should react to the chosen Institution. |
| FD-CREATE-22 | P1 | fixtures | Submit twice rapidly (double-click Save) | Exactly one FixedDeposit created; button disabled while pending. |
| FD-CREATE-23 | P1 | fixtures | Create FD, then in another tab delete `ACC-INR`'s institution/account before saving | Friendly form error ("no longer exists"), no unhandled exception page. |
| FD-CREATE-24 | P2 | fixtures | Create two FDs with identical everything | **[beyond-spec]** Allowed, but they must be distinguishable afterwards in every list (see FD-LIST-01). |
| FD-CREATE-25 | P1 | `ACC-INR` balance is 0 | Principal `100000`, debit now checked | **[beyond-spec]** Account goes to −100000.00 with no warning. Decide: block, or warn, or allow silently — but it must be a decision, and a negative balance must render clearly. |
| FD-CREATE-26 | P2 | fixtures | Principal `1,00,000` (with separators) | Rejected with a clear message, not silently mis-parsed. |
| FD-CREATE-27 | P2 | JPY account exists (0-decimal currency) | Principal `10000`, then `100.50` | `10000` accepted; `100.50` rejected (JPY has no minor units). Detail shows `¥10,000`. |

## 2. Opening debit recorded later — `/transfers/new?...purpose=fixed-deposit-opening`

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-OPEN-01 | P0 | FD created with debit unchecked (FD-CREATE-02) | Click "Record opening debit", source `ACC-INR`, amounts `100000` / `100000`, save | Transfer created with purpose opening. FD current principal **still** 100000.00 (opening does not add principal). `ACC-INR` debited once. |
| FD-OPEN-02 | P0 | FD-OPEN-01 done | Return to FD detail | "Record opening debit" link is **gone** (one opening Transfer only). |
| FD-OPEN-03 | P0 | FD already has an opening Transfer | Navigate directly to `/transfers/new?destinationFixedDepositId=<id>&purpose=fixed-deposit-opening` and submit | Form error "A FixedDeposit can only have one opening Transfer." Nothing persisted. |
| FD-OPEN-04 | P0 | FD created with debit unchecked, principal 100000 | Record opening debit with amount `250000` (≠ principal) | **Fixed.** `TransferRepository`/`PgTransferRepository.create()` reject a same-currency opening Transfer whose destination amount ≠ the FixedDeposit's `originalPrincipalMinor` with "Opening Transfer amount must match the FixedDeposit original principal." |
| FD-OPEN-05 | P0 | same | Record opening debit, source amount `100000`, destination amount `1` (same currency) | **Fixed.** `assertValidTransferAmounts` rejects mismatched same-currency legs with "Same-currency Transfer amounts must match on both legs." |
| FD-OPEN-06 | P1 | `FD-OPEN` (INR), `ACC-USD` exists | Record opening debit with source `ACC-USD` | Cross-currency funding: legs differ by design, realized FX rate shown on the Transfer. Verify the FD principal is untouched and the USD account is debited in USD. |
| FD-OPEN-07 | P1 | FD created with debit unchecked | Record opening debit dated `2025-06-01` (**before** the FD's opening date) | **[beyond-spec]** Should be rejected — an FD cannot be funded before it exists. |
| FD-OPEN-08 | P1 | FD status `PrematurelyClosed`, never had an opening Transfer | Open FD detail | **[beyond-spec]** No way to record the historical opening debit, because all actions hide when status ≠ Open. Decide whether that is acceptable. |
| FD-OPEN-09 | P0 | fixtures | On `/transfers/new`, set Destination type = FixedDeposit and read the "To" dropdown | **Mostly fixed.** `formatFixedDepositLabel` renders `name · principal · status · matures date`, and `TransferForm` now appends `· <Institution name>` (fixes the identical-option-text defect from the account picker equivalent), so two FDs are distinguishable. **Still open:** closed/non-Open FDs are still listed as destination options even though only an Open FixedDeposit can receive a Transfer (rejected server-side, but the picker doesn't filter them out first). |
| FD-OPEN-10 | P1 | fixtures | Set source = the FD's own linked Account, destination = same FD, amount 0 | **Fixed.** Rejected with "Transfer amounts must be greater than zero." (`assertValidTransferAmounts` in `src/domain/transfer.ts` now requires positive amounts on every purpose, not just FixedDeposit ones). Previously accepted and rendered `∞`/`NaN` as the realized FX rate. |

## 3. Top up — `/transfers/new?...purpose=fixed-deposit-top-up`

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-TOP-01 | P0 | `FD-OPEN`, principal 100000 | "Top up", source `ACC-INR`, both amounts `25000`, save | FD current principal 125000.00; **original principal unchanged at 100000.00**; `ACC-INR` debited 25000.00; Transfer listed on FD detail. |
| FD-TOP-02 | P0 | after FD-TOP-01 | Top up again by `10000` | Principal 135000.00. Both top-ups listed. |
| FD-TOP-03 | P0 | FD status `Matured` | Navigate to the top-up URL for that FD and submit | Form error "Only an Open FixedDeposit can receive a Transfer." Nothing persisted, principal unchanged. |
| FD-TOP-04 | P0 | FD status `PrematurelyClosed` | same | Same rejection. |
| FD-TOP-05 | P0 | `FD-OPEN` | Top up: source amount `25000`, destination amount `2500000` (same currency) | **Fixed.** `assertValidTransferAmounts`'s same-currency-legs-must-match check (see FD-OPEN-05) applies to every purpose, top-up included. |
| FD-TOP-06 | P0 | `FD-OPEN` | Top up with amount `-5000` | **Fixed.** `assertValidTransferAmounts` rejects `amountMinor <= 0` on every purpose, so a negative top-up is rejected before any principal mutation. |
| FD-TOP-07 | P1 | `FD-PAST` (past maturity, still Open) | Top up `10000` dated today | **[beyond-spec]** Should be rejected — you cannot add to a deposit whose term has ended. Currently allowed because only `status` is checked, never `maturityDate`. |
| FD-TOP-08 | P1 | `FD-OPEN` | Top up dated `2025-01-01` (before FD opening date) | **[beyond-spec]** Should be rejected. |
| FD-TOP-09 | P1 | `FD-OPEN` (INR), `ACC-USD` | Top up from `ACC-USD`: source `1000` USD, destination `85000` INR | Cross-currency top-up: USD account debited 1000, FD principal +85000, FX rate on Transfer. Confirm this is intended (`CONTEXT.md` allows per-side currencies). |
| FD-TOP-10 | P0 | `FD-OPEN`, `ACC-INR2` exists | Top up from `ACC-INR2` (not the linked Account) | Allowed by spec (only *withdrawals* are constrained to the linked Account). Verify the debit lands on `ACC-INR2`. |
| FD-TOP-11 | P1 | `FD-OPEN` | Top up, then reload the FD detail page | Principal shown is the updated value, not a cached one. |
| FD-TOP-12 | P1 | `FD-OPEN` | On `/transfers/new` from the "Top up" link, or with Destination = FixedDeposit on the generic Transfer form | No "FixedDeposit operation" / "Opening deposit" chooser. Purpose is top-up. Opening debit is only via create-time checkbox or "Record opening debit". |
| FD-TOP-13 | P1 | `FD-OPEN` | Top up with empty description | **[beyond-spec]** Either required or the FD's Transfer list must not render a blank row. |
| FD-TOP-14 | P2 | `FD-OPEN` | Top up `0.01`, repeat with `0.001` | `0.01` accepted (principal +1 paisa); `0.001` rejected. |

## 4. Withdraw — `/transfers/new?sourceFixedDepositId=...&purpose=fixed-deposit-withdrawal`

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-WDR-01 | P0 | `FD-OPEN`, principal 100000, matures 2027-01-01 | "Withdraw" `40000` dated today, save | Principal 60000.00, status stays `Open`. `ACC-INR` credited 40000.00. Destination is locked to the linked Account. |
| FD-WDR-02 | P0 | after FD-WDR-01 | Withdraw the remaining `60000` dated today (before maturity) | Principal 0.00, status `PrematurelyClosed`. `ACC-INR` credited 60000.00. FD detail hides Top up / Withdraw. |
| FD-WDR-03 | P0 | `FD-PAST` (matured 2026-06-01, principal 50000) | Withdraw `50000` dated today (after maturity) | Principal 0.00, status **`Matured`** (not PrematurelyClosed). |
| FD-WDR-04 | P0 | `FD-OPEN`, principal 100000 | Withdraw `100000.01` dated today (before maturity) | Rejected: "Withdrawal amount cannot exceed the FixedDeposit current principal." Principal unchanged. |
| FD-WDR-05 | P0 | `FD-PAST`, principal 50000 | Withdraw `53000` dated today (after maturity — principal + interest) | Accepted by design: principal 0.00, status `Matured`, account credited 53000.00. **[beyond-spec]** Confirm the 3000 interest is visible somewhere as interest rather than silently swallowed by a `max(0, …)` clamp. |
| FD-WDR-06 | P0 | FD status `Matured` | Navigate to the withdraw URL and submit | Rejected: "Only an Open FixedDeposit can be used as a Transfer source." |
| FD-WDR-07 | P0 | `FD-OPEN` | Withdraw with source amount `40000`, destination amount `1` (same currency) | **Fixed.** Same-currency-legs-must-match check (see FD-OPEN-05) applies to withdrawals too. |
| FD-WDR-08 | P0 | `FD-OPEN` | Withdraw `-10000` | **Fixed.** `assertValidTransferAmounts` rejects `amountMinor <= 0` on every purpose, so a negative withdrawal is rejected before the principal/status math runs. |
| FD-WDR-09 | P0 | `FD-OPEN` | Withdraw the full principal dated `2027-01-01` (exactly the maturity date) | Boundary: on the maturity date the FD must become `Matured`, not `PrematurelyClosed`. |
| FD-WDR-10 | P0 | `FD-OPEN` | Withdraw full principal dated `2026-12-31` (one day early) | `PrematurelyClosed`. |
| FD-WDR-11 | P1 | FD created with principal `0`, status Open (see FD-CREATE-08) | Withdraw `0` | **Fixed indirectly.** FD-CREATE-08 now rejects a zero-principal FD at creation, so this precondition can no longer be reached; a `0` withdrawal amount is separately rejected by `assertValidTransferAmounts` regardless. |
| FD-WDR-12 | P1 | `FD-OPEN` | Withdraw dated `2025-01-01` (before FD opening date) | **[beyond-spec]** Should be rejected. |
| FD-WDR-13 | P0 | `FD-OPEN` | On the withdraw form try to change Destination type / To | Both disabled and pinned to the linked Account (payout invariant enforced in the UI, not only server-side). |
| FD-WDR-14 | P0 | `FD-OPEN` | POST a withdrawal with `destinationAccountId` = `ACC-INR2` (bypassing the disabled control) | Rejected: "A FixedDeposit withdrawal must pay out to its linked Account." |
| FD-WDR-15 | P1 | `FD-OPEN`, principal 100000 | Withdraw `100000` and, from a second tab, submit the same withdrawal again | Only one succeeds; the second is rejected because the FD is no longer Open. Principal must not go negative or double-credit the account. |
| FD-WDR-16 | P1 | `FD-OPEN` | Withdraw `30000` dated **2026-06-01**, then top up `10000` dated **2026-03-01** (earlier), then withdraw the rest | **[beyond-spec]** Out-of-order dating: create-time checks use *current* principal while the delete-time recompute replays by date. Verify the two agree; if they cannot, out-of-order dates must be rejected. |
| FD-WDR-17 | P1 | `FD-OPEN` (INR) with `ACC-USD`… | not applicable — linked Account currency always equals FD currency | Confirm the withdraw form's currency fields are read-only and identical on both sides. |
| FD-WDR-18 | P2 | `FD-OPEN` | Withdraw with a description of 2000 characters | Stored/rendered without breaking the FD detail layout. |

## 5. FixedDeposit detail screen — `/fixed-deposits/[id]`

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-DETAIL-01 | P0 | `FD-OPEN` | Load the page | Shows current principal, original principal, rate, opening date, maturity date, linked Account (linked), Institution (linked), status. |
| FD-DETAIL-02 | P0 | unknown id | `/fixed-deposits/does-not-exist` | 404 page, not a crash. |
| FD-DETAIL-03 | P0 | `FD-OPEN` after a top-up | Load | Current ≠ original, and the labels make clear which is which. |
| FD-DETAIL-04 | P0 | rate 7.25% | Load | `7.25%`. Also check 7.00 → `7.00%`, 0.05 → `0.05%`, 12.5 → `12.50%`. |
| FD-DETAIL-05 | P1 | `FD-OPEN` | Read the heading | **Fixed.** Heading is `fixedDeposit.name` (a user-chosen name at create time), not the literal word "FixedDeposit". |
| FD-DETAIL-06 | P0 | `FD-OPEN` with several Transfers | Read "Related Transfers" | Each row states what it was (opening / top-up / withdrawal) and its amount. **[beyond-spec]** Currently rows show only description + date — no amount, no purpose, no direction, so the principal history is unauditable. |
| FD-DETAIL-07 | P1 | `FD-PAST` (past maturity, still Open) | Load | **[beyond-spec]** Nothing indicates the deposit has matured; it looks like a live deposit. A matured-but-unwithdrawn FD needs a visible signal. |
| FD-DETAIL-08 | P1 | `FD-OPEN` | Load | **[beyond-spec]** No maturity value / accrued interest / days-to-maturity anywhere, despite the app storing the rate. Confirm whether that is an accepted gap. |
| FD-DETAIL-09 | P0 | status `PrematurelyClosed` | Load | Status visible; Top up / Withdraw / Record-opening actions hidden; page still shows full Transfer history. |
| FD-DETAIL-10 | P1 | linked Account deleted (if reachable) | Load | Renders "Unavailable" rather than crashing. |
| FD-DETAIL-11 | P1 | `FD-OPEN` | Click "Back to HDFC Bank" | Returns to `/institutions/<id>`. |
| FD-DETAIL-12 | P1 | `FD-OPEN` | Hover each action button | Tooltip readable, accurate about the action's effect. |
| FD-DETAIL-13 | P0 | `FD-OPEN` | Look for a Delete action | **[beyond-spec]** There is none, by ADR-0003. But `ACC-INR` then can never be deleted either — its delete screen says "This Account still has 1 linked FixedDeposit. Delete those first", which is impossible. A mistyped FD is permanent. This dead end must be resolved. |

## 6. Deletion and reversal

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-DEL-01 | P0 | `FD-OPEN` funded, then topped up 25000 | Open the top-up Transfer, Delete Transfer | FD principal back to 100000.00, status `Open`, the account-side Transaction gone, account balance restored. |
| FD-DEL-02 | P0 | FD fully withdrawn (`PrematurelyClosed`) | Delete the closing withdrawal Transfer | Principal restored, status back to `Open`, FD actions available again. |
| FD-DEL-03 | P0 | FD `Matured` after a post-maturity withdrawal | Delete that withdrawal | Status back to `Open`, principal restored. |
| FD-DEL-04 | P0 | FD funded at creation (opening Transfer auto-created) | Delete the opening Transfer | Account debit reversed; FD principal **stays** 100000 (original principal is the baseline); "Record opening debit" reappears. Verify this is intended and not a silent money leak in the user's mental model. |
| FD-DEL-05 | P0 | FD with top-up 10000 dated 2026-06-01 and withdrawal of the full 110000 dated 2026-03-01 (earlier date, allowed at create time) | Delete any Transfer touching the FD | **[beyond-spec]** The delete-time recompute replays by date, hits "principal cannot become negative", and that error is wrapped into a generic database error which `deleteTransfer` does not catch — expect an unhandled server-action error page. Must fail gracefully or be prevented at create time. |
| FD-DEL-06 | P0 | `ACC-INR` has a linked FD | `/accounts/<id>/delete` | Blocked with a reason. **[beyond-spec]** The reason tells the user to delete the FD first, which no screen allows — see FD-DETAIL-13. |
| FD-DEL-07 | P0 | `INST-A` has an FD | `/institutions/<id>/delete` | Blocked, listing the FD. Same dead end. |
| FD-DEL-08 | P1 | FD funded | Delete the FD's opening Transfer twice (back button, resubmit) | Second attempt is a harmless no-op, not an error. |
| FD-DEL-09 | P1 | FD with 3 Transfers | Delete the middle one | Remaining principal recomputed from the *surviving* history, not naively reverted. |
| FD-DEL-10 | P1 | any FD Transfer | Delete it and land on `/` | Redirect works; dashboard reflects new balances immediately. |

## 7. Presentation across screens

| ID | P | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| FD-LIST-01 | P0 | two FDs at `INST-A` | Dashboard `/` | **Fixed.** Each row shows `fixedDeposit.name`, its status/maturity subtitle, and its principal amount — distinguishable. |
| FD-LIST-02 | P0 | `INST-A` page | `/institutions/<id>` | **Fixed.** FD rows show name, `status · matures <date>`, and principal amount, matching the Account rows' balance display. |
| FD-LIST-03 | P1 | FD in USD and FD in INR at one institution | Dashboard | Each amount rendered in its own currency; no cross-currency summing. |
| FD-LIST-04 | P1 | `ACC-INR` has a linked FD | `/accounts/<id>` | **[beyond-spec]** The Account page never mentions the linked FD, yet the FD blocks deletion and its opening debit sits in this ledger. A linked-FD reference belongs here. |
| FD-LIST-05 | P1 | FD funded at creation | `/accounts/<id>` ledger | The opening debit row reads "Opening deposit", is `Confirmed`, has a "Transfer" link, and no category tag. |
| FD-LIST-06 | P1 | FD-related Transfer | `/transfers/<id>` | **Mostly fixed.** An FD leg renders via `formatFixedDepositLabel` (name · principal · status · maturity), not the bare word "FixedDeposit", and the page has a "Purpose" row (`formatTransferPurpose`) distinguishing Opening deposit / Top up / Withdrawal / Transfer. |
| FD-LIST-07 | P2 | FD in JPY | Dashboard + detail | `¥10,000` with no decimals. |
| FD-LIST-08 | P1 | matured FD | Dashboard | Status `Matured` and principal 0.00 — clearly a closed deposit, not confusable with a live one. |

## 8. Visual and accessibility review

Run at 1440×900, 1024×768, and 390×844 (mobile).

| ID | P | Screen | Expected |
| --- | --- | --- | --- |
| FD-VIS-01 | P0 | `/fixed-deposits/new` | Labels aligned with inputs; the "Debit linked Account now" checkbox and its help text are visually grouped; Save button clearly primary. |
| FD-VIS-02 | P0 | `/fixed-deposits/new` with errors | Field errors sit next to their field, are announced (`role="alert"`), and the offending input is visibly invalid (`aria-invalid`). Check the principal/rate/date fields — several set the error text but not `aria-invalid`. |
| FD-VIS-03 | P0 | `/fixed-deposits/[id]` | `pw-facts` key/value grid aligns; long currency amounts do not wrap mid-number; status is visually distinct per state (Open vs Matured vs PrematurelyClosed) rather than plain text. |
| FD-VIS-04 | P0 | `/fixed-deposits/[id]` | The three actions (opening/top-up/withdraw) have a sane hierarchy; "Withdraw" is not styled identically to a benign link if it can close the deposit. |
| FD-VIS-05 | P0 | `/transfers/new` (withdraw context) | Disabled destination controls are visibly disabled and explain *why* they are locked. |
| FD-VIS-06 | P1 | `/transfers/new` | **Fixed** — see FD-OPEN-09. |
| FD-VIS-07 | P1 | mobile 390px | No horizontal scroll on FD detail; the facts grid stacks; action row wraps. |
| FD-VIS-08 | P1 | all FD screens | Heading order h1→h2 with no skips; every input has a programmatic label; focus ring visible on keyboard tab-through. |
| FD-VIS-09 | P1 | FD detail, empty state | "No Transfers recorded." reads as a real empty state, and an unfunded FD invites the opening debit. |
| FD-VIS-10 | P2 | FD detail | Dates render as raw `2027-01-01` while Transfer rows use locale format — inconsistent date formatting on one page. |

## 9. Data-integrity scenarios (cross-flow)

| ID | P | Scenario | Expected |
| --- | --- | --- | --- |
| FD-DATA-01 | P0 | Sum of (account debits into FD) vs (FD principal movements) | For same-currency Transfers these must always agree. **Fixed** — see FD-OPEN-05 / FD-TOP-05 / FD-WDR-07. |
| FD-DATA-02 | P0 | FD principal must never be negative, in any path, including negative Transfer amounts. | **Fixed** — see FD-TOP-06 / FD-WDR-08 (`assertValidTransferAmounts` rejects non-positive amounts on every purpose). |
| FD-DATA-03 | P0 | `originalPrincipalMinor` never changes after creation, through any number of top-ups, withdrawals, and Transfer deletions. | |
| FD-DATA-04 | P0 | Status is always consistent with principal: principal > 0 ⇒ `Open`; principal = 0 ⇒ `Matured` or `PrematurelyClosed`. Verify after every mutation and after Transfer deletion. | |
| FD-DATA-05 | P0 | A rejected operation persists **nothing** — no orphan Transfer, no orphan Transaction, no partial principal change. Check after each rejection case above. | |
| FD-DATA-06 | P1 | Reconciling `ACC-INR` after FD activity: the computed balance includes FD opening/top-up/withdrawal legs, so a bank snapshot matches with no phantom discrepancy. | |
| FD-DATA-07 | P1 | A future-dated FD opening debit (FD-CREATE-17) is excluded from a reconciliation dated before it, but included in the live balance. Confirm that is intended. | |
| FD-DATA-08 | P1 | Deleting an FD-related Transfer leaves no `transactions` row with a dangling `transfer_id`. | |
