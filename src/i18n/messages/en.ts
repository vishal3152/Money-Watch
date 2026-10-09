/**
 * The source catalog. Every other locale is typed as `Record<keyof typeof en, string>`,
 * so adding a key here is a compile error until `zh.ts` and `ar.ts` define it too.
 *
 * Keys are namespaced by screen. A `.one`/`.other` pair is a plural, read with
 * `translator.plural()`; `{name}` placeholders are filled by the caller.
 */
export const en = {
  // Shared
  "common.backToDashboard": "Back to Dashboard",
  "common.deleting": "Deleting…",
  "common.collapseSection": "Collapse {section}",
  "common.expandSection": "Expand {section}",
  "common.typeToConfirm": "Type {name} to confirm",

  // Navigation and header
  "nav.primary": "Primary",
  "nav.menu": "Menu",
  "nav.dashboard": "Dashboard",
  "nav.imports": "Imports",
  "nav.settings": "Settings",
  "nav.signOut": "Sign out",

  // Dashboard
  "dashboard.heading": "Dashboard",
  "dashboard.lede": "Independent balance tracking across Institutions.",
  "dashboard.currencyTotals.heading": "Balances by currency",
  "dashboard.currencyTotals.note":
    "Currencies are never summed together — Money Watch holds no market FX rate.",
  "count.accounts.one": "{count} account",
  "count.accounts.other": "{count} accounts",
  "count.fixedDepositsShort.one": "{count} FD",
  "count.fixedDepositsShort.other": "{count} FDs",
  "count.holdings.one": "{count} holding",
  "count.holdings.other": "{count} holdings",
  "count.shares.one": "{count} share",
  "count.shares.other": "{count} shares",
  "count.suspectedDuplicates.one": "{count} suspected duplicate",
  "count.suspectedDuplicates.other": "{count} suspected duplicates",
  "dashboard.noInstitutions": "No Institutions yet.",
  "dashboard.fixedDepositMaturity.heading": "Fixed deposit maturity overview",
  "dashboard.fixedDepositMaturity.matures": "matures {date}",
  "dashboard.portfolio.heading": "Portfolio snapshot",
  "dashboard.transferNote":
    "Add transfer moves money between tracked Accounts and Fixed Deposits in one atomic record.",
  "dashboard.addSectionHeading": "Add",
  "dashboard.addMenu": "+ Add",
  "dashboard.addInstitution": "Add Institution",
  "dashboard.addAccount": "Add Account",
  "dashboard.addFixedDeposit": "Add Fixed Deposit",
  "dashboard.addShareTradingAccount": "Add Share Trading Account",
  "dashboard.addTransfer": "Add transfer",

  // Settings — language
  "settings.language.heading": "Language",
  "settings.language.label": "Language",
  "settings.language.help":
    "Applies to every screen. Amounts stay in each Account's own currency.",

  // Redirect banners
  "systemMessage.accountCreated": "Account created. Check your email to confirm your account.",
  "systemMessage.passwordResetRequested": "If an account exists for that email, a password reset link has been sent.",
  "systemMessage.passwordReset": "Password changed. Sign in with your new password.",
  "systemMessage.linkExpired": "That sign-in link is invalid or has expired. Please try again.",
  "systemMessage.signInCancelled": "Sign-in was cancelled. Please try again.",
  "systemMessage.databasePathSaved":
    "Database path saved. This app is now using the database at the new location.",
  "systemMessage.institutionCreated": "Institution created.",
  "systemMessage.institutionUpdated": "Institution updated.",
  "systemMessage.institutionDeleted": "Institution deleted.",
  "systemMessage.bankAccountCreated": "Account created.",
  "systemMessage.bankAccountUpdated": "Account updated.",
  "systemMessage.bankAccountDeleted": "Account deleted.",
  "systemMessage.bankAccountHardDeleted": "Account and all its history permanently deleted.",
  "systemMessage.transactionCreated": "Transaction saved.",
  "systemMessage.transactionUpdated": "Transaction updated.",
  "systemMessage.transactionDeleted": "Transaction deleted.",
  "systemMessage.transferCreated": "Transfer saved.",
  "systemMessage.transferUpdated": "Transfer updated.",
  "systemMessage.transferDeleted": "Transfer deleted.",
  "systemMessage.fixedDepositCreated": "Fixed Deposit created.",
  "systemMessage.shareTradingAccountCreated": "Share trading account created.",
  "systemMessage.shareTradingAccountUpdated": "Share trading account updated.",
  "systemMessage.shareTradingAccountDeleted": "Share trading account deleted.",
  "systemMessage.stockTransactionCreated": "Stock transaction saved.",
  "systemMessage.stockTransactionUpdated": "Stock transaction updated.",
  "systemMessage.stockTransactionDeleted": "Stock transaction deleted.",

  // Shared entity counts
  "count.fixedDeposits.one": "{count} Fixed Deposit",
  "count.fixedDeposits.other": "{count} Fixed Deposits",
  "count.shareTradingAccounts.one": "{count} Share Trading Account",
  "count.shareTradingAccounts.other": "{count} Share Trading Accounts",
  "count.transactions.one": "{count} Transaction",
  "count.transactions.other": "{count} Transactions",

  // Shared form chrome
  "common.saving": "Saving…",
  "common.saveChanges": "Save changes",
  "common.cancel": "Cancel",
  "common.backTo": "Back to {name}",

  // Validation
  "errors.textTooLong": "Use at most {max} characters.",
  "errors.nameRequired": "Name is required.",

  // Institutions
  "institutions.new.heading": "Add Institution",
  "institutions.form.nameLabel": "Institution name",
  "institutions.form.submit": "Save institution",
  "institutions.edit.heading": "Edit {name}",
  "institutions.detail.lede": "Accounts and Fixed Deposits at this Institution.",
  "institutions.detail.accounts": "Accounts",
  "institutions.detail.noAccounts": "No Accounts yet.",
  "institutions.detail.fixedDeposits": "Fixed Deposits",
  "institutions.detail.noFixedDeposits": "No Fixed Deposits yet.",
  "institutions.detail.shareTradingAccounts": "Share Trading Accounts",
  "institutions.detail.noShareTradingAccounts": "No Share Trading Accounts yet.",
  "institutions.detail.addMenu": "+ Account",
  "institutions.detail.addAccount": "Add Account",
  "institutions.detail.addFixedDeposit": "Add Fixed Deposit",
  "institutions.detail.addShareTradingAccount": "Add Share Trading Account",
  "institutions.detail.edit": "Edit Institution",
  "institutions.detail.delete": "Delete Institution",
  "institutions.delete.heading": "Delete {name}?",
  "institutions.delete.blocked": "This Institution still has {reasons}. Delete those first.",
  "institutions.delete.blockedNote":
    "An Institution can only be deleted once nothing at it remains.",
  "institutions.delete.warning":
    "This permanently deletes the Institution. This cannot be undone.",
  "institutions.delete.confirm": "Delete Institution permanently",

  "common.listSeparator": ", ",

  // Accounts
  "accounts.new.heading": "Add Account",
  "accounts.new.needsInstitution": "Create an Institution before adding an Account.",
  "accounts.form.institutionLabel": "Institution",
  "accounts.form.nameLabel": "Account name",
  "accounts.form.numberLabel": "Account number",
  "accounts.form.currencyLabel": "Currency code",
  "accounts.form.commonCurrencies": "Common currencies",
  "accounts.form.submit": "Save account",
  "errors.accountNameRequired": "Account name is required.",
  "errors.currencyCodeInvalid": "Enter a three-letter uppercase currency code.",
  "errors.institutionMissing": "The selected Institution no longer exists.",

  // Forwarded verbatim from the database layer — see src/app/domain-error-text.ts
  "errors.databaseDetail": "{detail}",

  "count.reconciliations.one": "{count} Reconciliation",
  "count.reconciliations.other": "{count} Reconciliations",
  "count.adjustments.one": "{count} Adjustment",
  "count.adjustments.other": "{count} Adjustments",
  "count.transfers.one": "{count} Transfer",
  "count.transfers.other": "{count} Transfers",
  "count.linkedFixedDeposits.one": "{count} linked Fixed Deposit",
  "count.linkedFixedDeposits.other": "{count} linked Fixed Deposits",

  "accounts.detail.backToInstitution": "Back to Institution",
  "accounts.detail.computedBalance": "Computed balance",
  "accounts.detail.ledgerToggle": "Transaction ledger",
  "accounts.detail.reconcileNote":
    "Reconcile compares your computed ledger balance with a bank-reported snapshot to surface discrepancies.",
  "accounts.detail.reconciliationHistory": "Reconciliation history",
  "accounts.detail.reconcile": "Reconcile",
  "accounts.detail.noReconciliations": "No Reconciliations yet.",
  "accounts.detail.actionsNote":
    "Add income or expense for bank activity on this Account alone. Add transfer for money moving between your tracked Accounts or Fixed Deposits.",
  "accounts.detail.addTransaction": "Add income or expense",
  "accounts.detail.addTransfer": "Add transfer",
  "accounts.detail.edit": "Edit Account",
  "accounts.detail.delete": "Delete Account",
  "accounts.edit.heading": "Edit {name}",
  "accounts.delete.heading": "Delete {name}?",
  "accounts.delete.blocked": "This Account still has {reasons}. Delete those first.",
  "accounts.delete.blockedNote":
    "An Account can only be deleted once its ledger and history are empty.",
  "accounts.delete.warning": "This permanently deletes the Account. This cannot be undone.",
  "accounts.delete.confirm": "Delete Account permanently",
  "accounts.delete.dangerZone": "Danger Zone",
  "accounts.delete.hardWarning":
    "Hard delete permanently removes this Account and everything tied to it. A linked Fixed Deposit still blocks this. This cannot be undone.",
  "accounts.delete.hardWarningWithBreakdown":
    "Hard delete permanently removes this Account and everything tied to it: {breakdown}. A linked Fixed Deposit still blocks this. This cannot be undone.",
  "accounts.delete.transfersAffecting": "{transfers} (affecting {names})",
  "accounts.delete.hardConfirm": "Hard delete Account permanently",

  // Stored domain enums — the value in the database stays English, only the label changes
  "trustStatus.Confirmed": "Confirmed",
  "trustStatus.Imported": "Imported",
  "transactionKind.Income": "Income",
  "transactionKind.Expense": "Expense",
  "category.Grocery": "Grocery",
  "category.Dining": "Dining",
  "category.Education": "Education",
  "category.Transport": "Transport",
  "category.Utilities": "Utilities",
  "category.Rent": "Rent",
  "category.Health": "Health",
  "category.Entertainment": "Entertainment",
  "category.Other": "Other",
  "category.Salary": "Salary",
  "category.Interest": "Interest",
  "category.Gift": "Gift",
  "category.Other Income": "Other Income",

  // Transaction ledger
  "ledger.heading": "Transaction ledger",
  "ledger.searchLabel": "Search description",
  "ledger.searchPlaceholder": "e.g. groceries",
  "ledger.monthLabel": "Month",
  "ledger.allTime": "All time",
  "ledger.noMatches": "No Transactions match your search.",
  "ledger.empty": "No Transactions yet.",
  "ledger.filteredCount": "{shown} of {total}",
  "ledger.noDescription": "No description",
  "ledger.transferTag": "Transfer",
  "ledger.adjustmentTag": "Adjustment",
  "ledger.editTag": "Edit",
  "ledger.loading": "Loading Transactions…",

  // Transactions
  "transactions.new.heading": "Add income or expense",
  "transactions.edit.heading": "Edit income or expense",
  "transactions.backToAccount": "Back to Account",
  "transactions.form.lede":
    "Record one Account-only ledger event. Use Transfer instead for money moving between your tracked Accounts or Fixed Deposits.",
  "transactions.form.typeLabel": "Type",
  "transactions.form.categoryLabel": "Category",
  "transactions.form.amountLabel": "Amount ({currency})",
  "transactions.form.descriptionLabel": "Description",
  "transactions.form.occurredAtLabel": "Date and time",
  "transactions.form.submit": "Save transaction",
  "errors.descriptionRequired": "Description is required.",
  "errors.accountMissing": "This Account no longer exists.",
  "errors.kindRequired": "Choose Income or Expense.",
  "errors.amountInvalid": "Enter a valid amount for this Account's currency.",
  "errors.amountMustBePositive":
    "Enter a positive amount — use Type to choose Income or Expense.",
  "errors.categoryMismatch": "Choose a category that matches Income or Expense.",
  "errors.timestampInvalid": "Enter a valid date and time.",
  "errors.duplicateSubmission":
    "This looks like a duplicate submission — check the ledger before trying again.",

  "errors.transactionAccountMismatch": "This Transaction no longer belongs to this Account.",
  "transactions.delete.heading": "Delete this Transaction?",
  "transactions.delete.warning": "This permanently deletes the Transaction. This cannot be undone.",
  "transactions.delete.confirm": "Delete Transaction permanently",
  "transactions.delete.link": "Delete Transaction",

  // Reconcile
  "reconcile.heading": "Reconcile account",
  "reconcile.lede":
    "This creates a permanent record comparing this balance to your ledger — it can't be edited afterward.",
  "reconcile.balanceLabel": "Bank-reported balance ({currency})",
  "reconcile.asOfLabel": "As-of date",
  "reconcile.comparing": "Comparing…",
  "reconcile.submit": "Run reconciliation",
  "errors.reportedBalanceInvalid": "Enter a valid reported balance.",
  "errors.asOfDateInvalid": "Enter a valid as-of date.",
  "errors.reconciliationNotSaved": "The Reconciliation could not be saved.",

  // Transfers
  "transfers.new.heading": "Add transfer",
  "transfers.new.needsAccount": "Create an Account before recording a Transfer.",
  "transfers.edit.heading": "Edit transfer",
  "transfers.openingDebit.heading": "Record opening debit",
  "transfers.openingDebit.lede":
    "Records the one-time Transfer that funded this Fixed Deposit. Use Top up from the Fixed Deposit page for later additions to principal.",
  "transfers.backToTransfer": "Back to Transfer",
  "transfers.form.entityAccount": "Account",
  "transfers.form.entityFixedDeposit": "Fixed Deposit",
  "transfers.form.source": "Source",
  "transfers.form.destination": "Destination",
  "transfers.form.sourceType": "Source type",
  "transfers.form.destinationType": "Destination type",
  "transfers.form.typeLabel": "Type",
  "transfers.form.from": "From",
  "transfers.form.to": "To",
  "transfers.form.amountLabel": "Amount",
  "transfers.form.currencyLabel": "Currency code",
  "transfers.form.descriptionLabel": "Description",
  "transfers.form.occurredAtLabel": "Date and time",
  "transfers.form.submit": "Save transfer",
  "transfers.form.unknownInstitution": "Unknown institution",

  "fixedDepositStatus.Open": "Open",
  "fixedDepositStatus.Matured": "Matured",
  "fixedDepositStatus.PrematurelyClosed": "Prematurely closed",
  "fixedDeposits.subtitle": "{status} · matures {date}",
  "fixedDeposits.label": "{name} · {amount} · {subtitle}",
  "transferPurpose.fixed-deposit-opening": "Opening deposit",
  "transferPurpose.fixed-deposit-top-up": "Top up",
  "transferPurpose.fixed-deposit-withdrawal": "Withdrawal",
  "transferPurpose.general": "Transfer",

  "errors.sourceAmountInvalid": "Enter a valid source amount.",
  "errors.destinationAmountInvalid": "Enter a valid destination amount.",
  "errors.transferDuplicateSubmission":
    "This looks like a duplicate submission — check your Transfer history before trying again.",
  "errors.transferLegMissing": "A selected Account or Fixed Deposit no longer exists.",
  "transfers.detail.back": "Back",
  "transfers.detail.purpose": "Purpose",
  "transfers.detail.source": "Source",
  "transfers.detail.destination": "Destination",
  "transfers.detail.unavailable": "Unavailable",
  "transfers.detail.realizedFxRate": "Realized FX rate",
  "transfers.detail.edit": "Edit Transfer",
  "transfers.detail.delete": "Delete Transfer",
  "transfers.delete.heading": "Delete this Transfer?",
  "transfers.delete.warning":
    "This permanently deletes the Transfer and its linked Transactions on both sides. This cannot be undone.",
  "transfers.delete.recomputeMayReopen":
    "The linked Fixed Deposit's principal and status will be recomputed from its remaining Transfer history — it may be set back to Open.",
  "transfers.delete.recompute":
    "The linked Fixed Deposit's principal will be recomputed from its remaining Transfer history.",
  "transfers.delete.confirm": "Delete Transfer permanently",

  // Fixed deposits
  "fixedDeposits.new.heading": "Add Fixed Deposit",
  "fixedDeposits.new.needsAccount":
    "Create an Institution and linked Account before adding a Fixed Deposit.",
  "fixedDeposits.form.institutionAndAccount": "Institution & Account",
  "fixedDeposits.form.institutionLabel": "Institution",
  "fixedDeposits.form.linkedAccountLabel": "Linked Account",
  "fixedDeposits.form.noAccountsForInstitution":
    "This Institution has no Accounts yet — add one first, then come back here.",
  "fixedDeposits.form.details": "Details",
  "fixedDeposits.form.nameLabel": "Fixed Deposit name",
  "fixedDeposits.form.accountNumberLabel": "Account number",
  "fixedDeposits.form.terms": "Terms",
  "fixedDeposits.form.principalLabel": "Principal",
  "fixedDeposits.form.interestRateLabel": "Interest rate (%)",
  "fixedDeposits.form.openedDateLabel": "Opening date",
  "fixedDeposits.form.maturityDateLabel": "Maturity date",
  "fixedDeposits.form.debitNowLabel": "Debit linked Account now",
  "fixedDeposits.form.debitNowHelp":
    "Records an automatic opening Transfer that debits the selected Linked Account for the principal amount.",
  "fixedDeposits.form.submit": "Save Fixed Deposit",
  "errors.fixedDepositLinkMissing":
    "The selected Institution or linked Account no longer exists.",
  "errors.linkedAccountInstitutionMismatch":
    "Linked Account must belong to the selected Institution.",
  "errors.principalInvalid": "Enter a valid principal amount.",
  "errors.principalNotPositive": "Principal must be greater than zero.",
  "errors.interestRateInvalid": "Enter a non-negative percentage.",
  "errors.openedDateInvalid": "Enter a valid opening date.",
  "errors.maturityDateInvalid": "Enter a valid maturity date.",
  "errors.maturityBeforeOpening": "Maturity date must be after the opening date.",
  "errors.fixedDepositDuplicateSubmission":
    "This looks like a duplicate submission — check your Fixed Deposits before trying again.",

  "fixedDeposits.detail.status": "Status",
  "fixedDeposits.detail.accountNumber": "Account number",
  "fixedDeposits.detail.currentPrincipal": "Current principal",
  "fixedDeposits.detail.originalPrincipal": "Original principal",
  "fixedDeposits.detail.interestRate": "Interest rate",
  "fixedDeposits.detail.openedDate": "Opening date",
  "fixedDeposits.detail.maturityDate": "Maturity date",
  "fixedDeposits.detail.linkedAccount": "Linked Account",
  "fixedDeposits.detail.unavailable": "Unavailable",
  "fixedDeposits.detail.relatedTransfers": "Related Transfers",
  "fixedDeposits.detail.noTransfers": "No Transfers recorded.",
  "fixedDeposits.detail.actionsNote":
    "Record opening debit records the Transfer that funded this Fixed Deposit, if it wasn't recorded automatically when opened. Top up adds to its current principal from an Account. Withdraw pays out to the linked Account — a full withdrawal before maturity marks it Prematurely closed.",
  "fixedDeposits.detail.recordOpeningDebit": "Record opening debit",
  "fixedDeposits.detail.topUp": "Top up",
  "fixedDeposits.detail.withdraw": "Withdraw",
  "fixedDeposits.detail.maturedExplanation":
    "This Fixed Deposit has Matured — its principal was fully withdrawn on or after the maturity date.",
  "fixedDeposits.detail.prematurelyClosedExplanation":
    "This Fixed Deposit was closed early (Prematurely closed) — its principal was fully withdrawn before the maturity date.",
  "fixedDeposits.detail.viewWithdrawalTransfer": "View the withdrawal Transfer",

  "browser.filterPlaceholder": "Filter by name, number, or currency",
  "browser.filterByCurrency": "Filter by currency",
  "browser.allCurrencies": "All",
  "browser.noMatches": "No institutions or accounts match your filter.",
  "browser.emptyInstitution": "No Accounts, Fixed Deposits, or Share Trading Accounts yet.",
  "accounts.hideZeroBalances": "Hide zero-balance accounts",
  "accounts.allZeroBalanceHidden": "All Accounts are hidden. Turn off \"Hide zero-balance accounts\" to see them.",
  "count.openDiscrepancies.one": "{count} open Discrepancy",
  "count.openDiscrepancies.other": "{count} open Discrepancies",

  // Share trading
  "shareTrading.new.heading": "Add Share Trading Account",
  "shareTrading.new.needsInstitution": "Create an Institution before adding a Share Trading Account.",
  "shareTrading.form.submit": "Save share trading account",
  "shareTrading.edit.heading": "Edit {name}",
  "shareTrading.detail.noStockTransactions": "No stock transactions yet.",
  "shareTrading.detail.holdings": "Holdings",
  "shareTrading.detail.transactions": "Transactions",
  "shareTrading.detail.stockTransactionSub": "{quantity} shares @ {price} · {when}",
  "shareTrading.detail.addStockTransaction": "Add stock transaction",
  "shareTrading.detail.edit": "Edit Share Trading Account",
  "shareTrading.detail.delete": "Delete Share Trading Account",
  "shareTrading.delete.heading": "Delete {name}?",
  "shareTrading.delete.blocked": "This Share Trading Account still has {reasons}. Delete those first.",
  "shareTrading.delete.blockedNote":
    "A Share Trading Account can only be deleted once its Holdings history is empty.",
  "shareTrading.delete.warning":
    "This permanently deletes the Share Trading Account. This cannot be undone.",
  "shareTrading.delete.confirm": "Delete Share Trading Account permanently",
  "count.stockTransactions.one": "{count} Stock Transaction",
  "count.stockTransactions.other": "{count} Stock Transactions",
  "count.stockImportBatches.one": "{count} Stock Import Batch",
  "count.stockImportBatches.other": "{count} Stock Import Batches",
  "stockTransactionType.Buy": "Buy",
  "stockTransactionType.Sell": "Sell",

  // Stock transactions
  "stockTransactions.new.heading": "Add stock transaction",
  "stockTransactions.edit.heading": "Edit stock transaction",
  "stockTransactions.form.typeLabel": "Type",
  "stockTransactions.form.scripCodeLabel": "Scrip/symbol code",
  "stockTransactions.form.scripCodePlaceholder": "e.g. AAPL",
  "stockTransactions.form.quantityLabel": "Quantity (shares)",
  "stockTransactions.form.priceLabel": "Price per share ({currency})",
  "stockTransactions.form.descriptionLabel": "Description",
  "stockTransactions.form.occurredAtLabel": "Date and time",
  "stockTransactions.form.submit": "Save stock transaction",
  "stockTransactions.delete.heading": "Delete this stock transaction?",
  "stockTransactions.delete.warning":
    "This permanently deletes the stock transaction. This cannot be undone.",
  "stockTransactions.delete.confirm": "Delete stock transaction permanently",
  "stockTransactions.delete.link": "Delete stock transaction",
  "errors.scripCodeRequired": "Scrip/symbol code is required.",
  "errors.stockTypeRequired": "Choose Buy or Sell.",
  "errors.quantityInvalid": "Enter a positive whole number of shares.",
  "errors.shareTradingAccountMissing": "This Share Trading Account no longer exists.",
  "errors.priceInvalid": "Enter a valid, non-negative price for this account's currency.",
  "errors.stockTransactionAccountMismatch":
    "This stock transaction no longer belongs to this Share Trading Account.",

  "errors.discrepancyMissing": "This Discrepancy no longer exists.",
  "errors.discrepancyAlreadyResolved": "This Discrepancy has already been resolved.",
  "errors.resolutionRequired": "Choose how to resolve this Discrepancy.",
  "errors.adjustmentFieldsRequired": "Enter an amount and description for the Adjustment.",
  "errors.reconciliationAccountMissing": "The Reconciliation's Account no longer exists.",
  "errors.adjustmentAmountInvalid": "Enter a valid Adjustment amount.",

  // Reconciliation detail
  "reconciliations.heading": "Reconciliation",
  "reconciliations.reportedBalance": "Bank-reported balance",
  "reconciliations.computedBalance": "Computed balance",
  "reconciliations.difference": "Difference",
  "reconciliations.discrepancy": "Discrepancy",
  "reconciliations.unresolvedBadge": "Unresolved",
  "reconciliations.unresolvedNote": "This Discrepancy is unresolved.",
  "reconciliations.resolvedNote": "Resolved: {resolution}",
  "reconciliations.adjustmentCreated": "Adjustment created — {amount} — {description}",
  "reconciliations.balancesMatch": "Balances match. No Discrepancy was created.",
  "discrepancyResolution.disputed-with-bank": "Disputed with Institution",
  "discrepancyResolution.corrected-my-record": "Corrected my record",
  "reconciliations.form.resolutionLabel": "Resolution",
  "reconciliations.form.resolutionHelp":
    "Disputed with Institution leaves your ledger as-is. Correct my record creates a new Adjustment Transaction that permanently changes your account history.",
  "reconciliations.form.optionDisputed": "Disputed with Institution",
  "reconciliations.form.optionCorrect": "Correct my record",
  "reconciliations.form.amountLabel": "Adjustment amount",
  "reconciliations.form.descriptionLabel": "Description",
  "reconciliations.form.resolving": "Resolving…",
  "reconciliations.form.submit": "Resolve Discrepancy",

  // Statement imports
  "imports.heading": "Statement imports",
  "imports.lede": "Review each batch before it's confirmed onto the ledger.",
  "imports.backToImports": "Back to Imports",
  "imports.emailSync": "Email sync",
  "imports.emailSyncEmpty":
    "No imports yet from Email Sync. Configure a mailbox from Settings to get started.",
  "imports.emailSyncBatches": "Email sync imports",
  "imports.mcpImport": "MCP import",
  "imports.mcpEmpty": "No imports yet from your AI assistant. Connect one from Settings to get started.",
  "imports.mcpBatches": "MCP imports",
  "imports.unknownAccount": "Unknown Account",
  "imports.unknownInstitution": "Unknown Institution",
  "imports.batchSubtitle": "{source} · {when}",
  "imports.confirmed": "Confirmed",
  "imports.unconfirmed": "Unconfirmed",
  "imports.unresolvedAlerts": "Unresolved email alerts",
  "imports.unresolvedAlertsLede":
    "Bank alert emails email sync could not import on its own — a detail it couldn't read, or no matching Account. Never retried automatically: correct what's wrong and import each one below.",
  "imports.needsYou": "Needs you",
  "imports.reviewAndImport": "Review & import",
  "imports.needsAccountFirst": "Add an Account first, then import this alert.",
  "imports.failureInvalidFields": "Some details couldn't be read from the email",
  "imports.failureImplausibleDate": "Transaction date doesn't match when the email arrived",
  "imports.failureMinorUnits": "Amount doesn't match the Account's currency precision",
  "imports.failureNoMatch": "No matching Account — {detail}",
  "imports.failureMultipleMatches": "Multiple Accounts match — {detail}",
  "imports.failureOther": "Invalid or missing “{reason}”",
  "imports.lineItems": "Line items",
  "imports.noLineItems": "No line items in this batch.",
  "imports.removeFromImport": "Remove from import",
  "imports.suspectedDuplicate": "Suspected duplicate",
  "imports.viewPossibleOriginal": "View possible original",
  "imports.dismissDuplicate": "Not a duplicate — keep it",
  "imports.confirmBlockedByDuplicates": "Resolve {count} before you can confirm this import.",
  "imports.confirming": "Confirming…",
  "imports.confirmAll": "Confirm All",
  "imports.undo": "Undo Import",
  "imports.viewReconciliation": "View Reconciliation",
  "imports.delete.heading": "Undo this import?",
  "imports.delete.blockedAdjustment":
    "This import's Reconciliation already has an owner-authored Adjustment. Undo is not available.",
  "imports.delete.blockedLaterReconciliation":
    "A later Reconciliation already exists for this Account. Undo is not available.",
  "imports.delete.blockedNote":
    "A confirmed batch's Transactions are part of the ledger; edit or delete them individually instead.",
  "imports.delete.undoConfirmedWarning":
    "This reverses the confirmation for {account}: its Transactions, and any BalanceSnapshot/Reconciliation it created, are removed. This cannot be undone.",
  "imports.delete.undoConfirmedWarningNoAccount":
    "This reverses the confirmation: its Transactions, and any BalanceSnapshot/Reconciliation it created, are removed. This cannot be undone.",
  "imports.delete.deleteWarning":
    "This permanently deletes the import batch for {account} and every Transaction it created. This cannot be undone.",
  "imports.delete.deleteWarningNoAccount":
    "This permanently deletes the import batch and every Transaction it created. This cannot be undone.",
  "imports.delete.confirm": "Undo Import permanently",
  "imports.alertForm.accountLabel": "Account",
  "imports.alertForm.directionLabel": "Direction",
  "imports.alertForm.moneyIn": "Money in",
  "imports.alertForm.moneyOut": "Money out",
  "imports.alertForm.amountLabel": "Amount",
  "imports.alertForm.currencyLabel": "Currency",
  "imports.alertForm.dateLabel": "Date",
  "imports.alertForm.descriptionLabel": "Description",
  "imports.alertForm.importing": "Importing…",
  "imports.alertForm.submit": "Import to Account",
  "imports.alertForm.unreadField": "The email sync couldn't read this — check it.",
  "errors.alertDirection": "Choose whether this was money in or money out.",
  "errors.alertAmount": "Enter the amount as plain digits, e.g. 1282.05.",
  "errors.alertCurrency": "Enter the alert's currency code, e.g. INR.",
  "errors.alertDate": "Enter a valid date.",
  "errors.alertDescription": "Enter a description.",
  "errors.alertPayload": "Fill in the transaction details.",
  "errors.alertValueInvalid": "This value isn't valid for import.",
  "errors.alertCurrencyMismatch": "That Account's currency doesn't match this alert.",
  "errors.alertAccountRequired": "Choose an Account.",
  "errors.alertMinorUnits": "This amount doesn't match the Account's currency precision.",
  "errors.alertGone": "This alert is no longer in the queue. Refresh the page and try again.",

  "imports.backToImport": "Back to Import",

  // Login
  "login.heading": "Welcome",
  "login.lede": "Sign in to open your ledger, or create a cloud account.",
  "login.accountAction": "Account action",
  "login.signIn": "Sign in",
  "login.createAccount": "Create account",
  "login.emailLabel": "Email",
  "login.passwordLabel": "Password",
  "login.signingIn": "Signing in…",
  "login.creatingAccount": "Creating account…",
  "login.or": "Or",
  "login.signInWithGoogle": "Sign in with Google",
  "login.simpleLede": "Sign in with your email and password.",
  "login.forgotPasswordLink": "Forgot password?",
  "login.forgotPasswordHeading": "Reset your password",
  "login.forgotPasswordLede": "Enter your email and we'll send you a link to reset your password.",
  "login.sendResetLink": "Send reset link",
  "login.sendingResetLink": "Sending…",
  "login.resetPasswordHeading": "Set a new password",
  "login.resetPasswordLede": "Enter a new password for your account.",
  "login.newPasswordLabel": "New password",
  "login.confirmPasswordLabel": "Confirm password",
  "login.setNewPassword": "Set new password",
  "login.settingNewPassword": "Setting new password…",
  "errors.emailRequired": "Email is required.",
  "errors.passwordRequired": "Password is required.",
  "errors.invalidCredentials": "Incorrect email or password.",
  "errors.passwordMismatch": "Passwords don't match.",
  "errors.resetLinkExpired": "This password reset link has expired or was already used. Request a new one.",

  // Stock trade imports
  "stockImports.heading": "Stock trade imports",
  "stockImports.lede":
    "Broker/demat trade imports created by your AI assistant. Review each batch before it's confirmed onto the ledger.",
  "stockImports.empty":
    "No stock trade imports yet. Connect an AI assistant from Settings to get started.",
  "stockImports.unknownAccount": "Unknown Share Trading Account",
  "stockImports.backToStockImports": "Back to Stock Imports",
  "stockImports.backToStockImport": "Back to Stock Import",
  "stockImports.delete.heading": "Undo this stock import?",
  "stockImports.delete.alreadyConfirmed":
    "This import is already confirmed and can no longer be undone.",
  "stockImports.delete.blockedNote":
    "A confirmed batch's Stock Transactions are part of the ledger; edit or delete them individually instead.",
  "stockImports.delete.warning":
    "This permanently deletes the stock import batch for {account} and every Stock Transaction it created. This cannot be undone.",
  "stockImports.delete.warningNoAccount":
    "This permanently deletes the stock import batch and every Stock Transaction it created. This cannot be undone.",

  // Not found and loading
  "notFound.heading": "Not found",
  "notFound.lede": "That record does not exist.",
  "notFound.home": "Home",
  "loading.label": "Loading",

  // Settings
  "settings.heading": "Settings",
  "settings.database.label": "Database",
  "settings.database.fileLabel": "Database file",
  "settings.database.pickFile": "Pick file…",
  "settings.database.pickFolder": "Pick folder…",
  "settings.database.help":
    "Absolute file path, or folder path to store a default paisa-watch.db file. Parent folders are created automatically.",
  "settings.database.newPath": "This path doesn't exist yet — a new, empty database will be created here.",
  "settings.database.unreadable":
    "This file doesn't look like a Money Watch database. Choose a different path.",
  "settings.database.emptyPath": "This path already exists and is empty.",
  "settings.database.existingData":
    "This path already contains {institutions}, {accounts}, {fixedDeposits}, and {transactions}. Saving will switch this app to that data.",
  "settings.database.confirmAndSave": "Confirm and save",
  "settings.database.checking": "Checking…",
  "settings.database.save": "Save database path",
  "settings.mcp.heading": "Connect AI Assistant",
  "settings.mcp.ledeCloud":
    "Connect Claude Desktop, Cursor, or another MCP client with a server URL and access token.",
  "settings.mcp.ledeLocal":
    "Connect Claude Desktop, Cursor, or another MCP client so it can import bank statements from this device.",
  "settings.emailSync.heading": "Email Alert Sync",
  "settings.emailSync.lede":
    "Periodically checks this mailbox for bank debit/credit alert emails and, once every field below is saved, turns matched ones into Statement Imports you review at {importsLink}.",
  "settings.emailSync.cronNote":
    "Runs on a scheduled cron job rather than a background process on this device.",
  "settings.emailSync.statusLabel": "Sync status",
  "settings.emailSync.neverChecked": "Never checked yet.",
  "settings.emailSync.lastChecked": "Last checked {when}.",
  "settings.emailSync.lastSucceeded": "Last check succeeded.",
  "settings.emailSync.lastFailed": "Last check failed: {error}",
  "settings.emailSync.checking": "Checking…",
  "settings.emailSync.checkNow": "Check now",
  "settings.emailSync.checkResult":
    "Checked now — {matched} matched, {unresolved} to review, {ignored} not bank alerts, {skipped} already read.",
  "settings.emailSync.unreachable": "Could not reach the server. Try again.",
  "settings.emailSync.mailbox": "Mailbox",
  "settings.emailSync.imapHost": "IMAP host",
  "settings.emailSync.imapPort": "IMAP port",
  "settings.emailSync.imapDefaultsHelp":
    "Prefilled for Gmail ({host}, port {port}). Change the host and port if you use a different email provider.",
  "settings.emailSync.imapUser": "IMAP username",
  "settings.emailSync.imapPassword": "IMAP app password",
  "settings.emailSync.passwordSaved": "Leave blank to keep the saved password.",
  "settings.emailSync.passwordNotSaved": "Not yet saved.",
  "settings.emailSync.passwordHelp":
    "{saved} Using Gmail? Use an {appPasswordLink}, not your regular Google password — Google requires one for IMAP when 2-Step Verification is on, and it can’t be used to sign in to your account for anything else.",
  "settings.emailSync.appPasswordLinkText": "App Password",
  "settings.emailSync.processing": "Processing",
  "settings.emailSync.processingHelp":
    "Money Watch calls an AI model to read each alert email — any provider that speaks the OpenAI-compatible chat-completions API works, including OpenRouter, OpenAI itself, or your own locally-hosted {ollamaLink} server if you’d rather keep alert emails off third-party servers entirely.",
  "settings.emailSync.llmBaseUrl": "LLM endpoint URL",
  "settings.emailSync.llmBaseUrlHelp":
    "Paste the full web address, starting with {https} or {http} — not just the site name. For example {exampleUrl} works; {bareHost} alone does not. Other common values: {openAiUrl} (OpenAI), or {ollamaUrl} (local Ollama).",
  "settings.emailSync.publicHostOnly":
    "Cloud mode only accepts a public host — a local Ollama server on your own machine isn't reachable from the cloud, so use a hosted provider here.",
  "settings.emailSync.llmModel": "Model",
  "settings.emailSync.llmModelHelp":
    "The exact model name your provider expects, e.g. {openRouterModel} (OpenRouter) or {ollamaModel} (a model you’ve already pulled in Ollama).",
  "settings.emailSync.llmApiKey": "LLM API key",
  "settings.emailSync.apiKeySaved": "Leave blank to keep the saved key.",
  "settings.emailSync.apiKeyHelp":
    "{saved}Leave blank entirely if your provider needs no key, e.g. a local Ollama server.",
  "settings.emailSync.cloudSchedule":
    "Runs once daily on a fixed schedule in cloud mode, not a configurable interval.",
  "settings.emailSync.pollInterval": "Poll every (minutes)",
  "settings.emailSync.submit": "Save email sync settings",
  "count.institutions.one": "{count} Institution",
  "count.institutions.other": "{count} Institutions",

  "settings.lede.cloud": "Money Watch runs in the cloud in the browser.",
  "settings.lede.desktop": "Choose where the local SQLite database file lives on this device.",
  "settings.lede.selfHosted": "Choose where the local SQLite database file lives on this server.",

  "errors.databasePathCloudMode": "Database path settings are not available in cloud mode.",
  "errors.databasePathRequired": "Database file path is required.",
  "errors.databasePathUnopenable": "Could not open or prepare the database at that path.",

  "errors.emailSyncSignIn": "Sign in to configure email alert sync.",
  "errors.imapHostRequired": "IMAP host is required.",
  "errors.imapHostPublic": "Enter a public IMAP hostname (not localhost or a private IP).",
  "errors.imapPortInvalid": "Enter a valid port number.",
  "errors.imapUserRequired": "IMAP username is required.",
  "errors.imapPasswordRequired": "IMAP password is required.",
  "errors.llmBaseUrlRequired": "LLM endpoint URL is required.",
  "errors.llmBaseUrlInvalid":
    "Enter a valid http(s) URL, e.g. https://openrouter.ai/api/v1/chat/completions.",
  "errors.llmBaseUrlPublic": "Enter a public URL (not localhost or a private IP).",
  "errors.llmModelRequired": "Model is required.",
  "errors.pollIntervalInvalid": "Enter a whole number of minutes, at most {max} (24 hours).",
  "settings.emailSync.saved": "Email alert sync settings saved.",

  // MCP setup
  "mcp.ledeCloud":
    "Point Claude Desktop, Cursor, or another MCP-compatible assistant at this server, then send your access token as an Authorization header so it can import bank statements.",
  "mcp.ledeLocal":
    "Point Claude Desktop, Cursor, or another MCP-compatible assistant at this server, then ask it to import a bank statement. This endpoint only accepts connections from this device, so no login or API key is needed.",
  "mcp.copy": "Copy",
  "mcp.copied": "Copied",
  "mcp.copyLabel": "Copy {label}",
  "mcp.step1Title": "1. Server URL",
  "mcp.step1Lede": "Use this exact address for this instance — it matches how you opened the app{https}.",
  "mcp.httpsNote": " (HTTPS)",
  "mcp.serverUrlLabel": "MCP server URL",
  "mcp.step2Title": "2. Access token",
  "mcp.tokenJustGenerated": "Copy this token now — it won't be shown again. Only its hash is stored.",
  "mcp.accessTokenLabel": "MCP access token",
  "mcp.tokenExists":
    "A token is already generated. Regenerate to replace it (the old one stops working immediately and a new plaintext is shown once), or revoke to disable MCP access.",
  "mcp.noToken": "No token yet. Generate one, then paste it into the client config below.",
  "mcp.generating": "Generating…",
  "mcp.regenerateToken": "Regenerate token",
  "mcp.generateToken": "Generate token",
  "mcp.revoking": "Revoking…",
  "mcp.revokeToken": "Revoke token",
  "mcp.step3ClientConfig": "3. Client config",
  "mcp.step2ClientConfig": "2. Client config",
  "mcp.clientConfigLede":
    "Cursor: Settings → MCP → edit {cursorFile}. Claude Code: add the same entry to {claudeFile}. Paste the block below.",
  "mcp.configLabel": "mcp.json",
  "mcp.configHelpReplaceToken":
    "Replace YOUR_TOKEN_HERE with your token, or regenerate above to fill it automatically.",
  "mcp.configHelpGenerateFirst":
    "Generate a token above first, then copy this block again — the placeholder will be replaced.",
  "mcp.configHelpTokenIncluded":
    "This block already includes your new token in the Authorization header.",
  "mcp.configHelpLocal":
    "Local/desktop needs no headers — omit them if your client adds any by default.",
  "mcp.step3ClaudeDesktop": "3. Claude Desktop",
  "mcp.claudeDesktopLede":
    "Settings → Connectors → Add custom connector → paste the server URL from step 1. Desktop may attempt an OAuth handshake; for this local endpoint that step should complete with nothing to fill in.",
  "mcp.step4Title": "4. Verify",
  "mcp.verifyLede":
    "Ask the assistant to list your Money Watch accounts. It should call {toolName}. Then open {importsLink} after an import, or {stockImportsLink} after a broker/demat statement import.",
  "mcp.statementImports": "Statement Imports",
  "mcp.stockTradeImports": "Stock Trade Imports",

  "errors.mcpSignInGenerate": "Sign in to generate an MCP access token.",
  "errors.mcpSignInRevoke": "Sign in to revoke an MCP access token.",

  "select.placeholder": "Select…",
  "select.close": "Close",
  "select.done": "Done",

  "errors.checkNowSignIn": "Sign in to check email alert sync.",
  "errors.checkNowNotConfigured": "Configure email alert sync before checking it."
} as const;
