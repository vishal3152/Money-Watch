import { textFieldLengthError } from "@/app/form-limits";
import { DatabaseConstraintError } from "@/db/errors";
import {
  getAccountRepository,
  getImportBatchRepository,
  getInstitutionRepository,
  getShareTradingAccountRepository,
  getStockImportBatchRepository,
  getStockTransactionRepository,
  getTransactionRepository,
  type RepositoryFactoryDeps
} from "@/db/repository-factory";
import { findAccountNumberMatches, resolveAccountByNumberSuffix } from "@/domain/account-number-match";
import { assertValidCalendarDate } from "@/domain/calendar-date";
import { parseDecimalToMinorUnits } from "@/domain/decimal-input";
import { uuidFromHash } from "@/domain/deterministic-id";
import type { ImportBatch } from "@/domain/import-batch";
import {
  assertValidClosingBalance,
  assertValidOpeningBalance,
  OPENING_BALANCE_DESCRIPTION
} from "@/domain/import-batch";
import type { StockImportBatch } from "@/domain/stock-import-batch";
import { parseWholeShareQuantity, type StockTransactionType } from "@/domain/stock-transaction";
import { assertValidCategoryForKind, type TransactionCategory } from "@/domain/transaction-category";

export class InvalidAccountResolutionInputError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidAccountResolutionInputError";
  }
}

export class InvalidMcpCreateInputError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidMcpCreateInputError";
  }
}

export class OwnerConfirmationRequiredError extends Error {
  constructor(toolName: string) {
    super(
      `Ask the owner to confirm before calling ${toolName}, then call again with confirmed: true.`
    );
    this.name = "OwnerConfirmationRequiredError";
  }
}

function assertOwnerConfirmed(confirmed: boolean, toolName: string): void {
  if (confirmed !== true) {
    throw new OwnerConfirmationRequiredError(toolName);
  }
}

function requireTrimmedName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new InvalidMcpCreateInputError("name is required.");
  }
  const nameLengthError = textFieldLengthError(name);
  if (nameLengthError) {
    throw new InvalidMcpCreateInputError(`name: ${nameLengthError}`);
  }
  return name;
}

function requireAccountNumberWithLast4(raw: string | null | undefined): string {
  const accountNumber = (raw ?? "").trim();
  if (accountNumber.length === 0) {
    throw new InvalidMcpCreateInputError(
      "accountNumber is required (at least 4 digits) so resolve_account can match it later."
    );
  }
  const accountNumberLengthError = textFieldLengthError(accountNumber);
  if (accountNumberLengthError) {
    throw new InvalidMcpCreateInputError(`accountNumber: ${accountNumberLengthError}`);
  }
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new InvalidMcpCreateInputError(
      "accountNumber must contain at least 4 digits so resolve_account can match by its last 4."
    );
  }
  return accountNumber;
}

function requireCurrencyCode(raw: string): string {
  const currencyCode = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    throw new InvalidMcpCreateInputError('currencyCode must be a three-letter ISO code, e.g. "INR".');
  }
  return currencyCode;
}

function accountNumberSuffix(accountNumber: string): string {
  return accountNumber.replace(/\D/g, "").slice(-4);
}

/** Deterministic ids for one idempotency key, scoped by `namespace` (e.g. "commit_import" vs.
 * "commit_stock_import" so the two tools never collide on the same key) — the batch id is always
 * index 0, so a caller can look it up again without re-deriving every line-item id first. Mirrors
 * `src/email-sync/email-alert-import-ids.ts`'s pattern for the same reason: a crash or retry
 * between create and the caller learning the result must land on the same primary key, not a
 * second write. */
function idempotentIdSequence(namespace: string, idempotencyKey: string): () => string {
  let n = 0;
  return () => uuidFromHash(`${namespace}:${idempotencyKey}:${n++}`);
}

export async function listInstitutions(deps: RepositoryFactoryDeps = {}) {
  return (await getInstitutionRepository(deps)).listAll();
}

export type CreateInstitutionInput = {
  name: string;
  /** Must be true — set only after the owner explicitly confirms in conversation. */
  confirmed: boolean;
};

export type CreateInstitutionResult = {
  created: boolean;
  institution: { id: string; name: string };
};

export type CreateInstitutionDeps = RepositoryFactoryDeps & { newId?: () => string };

/**
 * Creates an Institution after the owner confirms in chat (`confirmed: true`). If an Institution
 * with the same name already exists (case-insensitive), returns it without creating a duplicate.
 */
export async function createInstitution(
  input: CreateInstitutionInput,
  deps: CreateInstitutionDeps = {}
): Promise<CreateInstitutionResult> {
  assertOwnerConfirmed(input.confirmed, "create_institution");

  const name = requireTrimmedName(input.name);

  const institutions = await getInstitutionRepository(deps);
  const existing = (await institutions.listAll()).find(
    (institution) => institution.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    return { created: false, institution: { id: existing.id, name: existing.name } };
  }

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const institution = await institutions.create({ id, name });
  return { created: true, institution: { id: institution.id, name: institution.name } };
}

export type CreateAccountInput = {
  institutionId: string;
  name: string;
  currencyCode: string;
  /** Required — at least 4 digits so later resolve_account last-4 matching works. */
  accountNumber: string;
  /** Must be true — set only after the owner explicitly confirms in conversation. */
  confirmed: boolean;
};

export type CreateAccountResult = {
  created: boolean;
  account: { id: string; name: string; currencyCode: string; accountNumber: string | null };
  institution: { id: string; name: string };
};

export type CreateAccountDeps = RepositoryFactoryDeps & { newId?: () => string };

/**
 * Creates an Account after the owner confirms in chat (`confirmed: true`). Requires an existing
 * institutionId. Reuses an existing Account at the same Institution whose number shares the same
 * last 4 digits (returns `created: false`) instead of minting a duplicate that would make
 * resolve_account ambiguous.
 */
export async function createAccount(
  input: CreateAccountInput,
  deps: CreateAccountDeps = {}
): Promise<CreateAccountResult> {
  assertOwnerConfirmed(input.confirmed, "create_account");

  const name = requireTrimmedName(input.name);
  const accountNumber = requireAccountNumberWithLast4(input.accountNumber);
  const currencyCode = requireCurrencyCode(input.currencyCode);

  const institution = await (await getInstitutionRepository(deps)).getById(input.institutionId);
  if (!institution) {
    throw new DatabaseConstraintError(new Error(`Institution ${input.institutionId} does not exist.`));
  }

  const suffix = accountNumberSuffix(accountNumber);
  const claim = { accountNumberSuffix: suffix, institutionName: institution.name };

  const shareTradingAccounts = await listShareTradingAccounts(deps);
  const shareTradingMatches = findAccountNumberMatches(
    claim,
    shareTradingAccounts.map((shareTradingAccount) => ({
      accountId: shareTradingAccount.id,
      accountNumber: shareTradingAccount.accountNumber,
      institutionName: shareTradingAccount.institution.name
    }))
  );
  if (shareTradingMatches.length > 0) {
    throw new InvalidMcpCreateInputError(
      "A ShareTradingAccount already matches this account number and Institution — use create_share_trading_account or resolve_share_trading_account instead."
    );
  }

  const accounts = await listAccounts(deps);
  const sameInstitutionMatches = findAccountNumberMatches(
    claim,
    accounts.map((account) => ({
      accountId: account.id,
      accountNumber: account.accountNumber,
      institutionName: account.institution.name
    }))
  ).filter((match) => {
    const account = accounts.find((candidate) => candidate.id === match.accountId);
    return account?.institution.id === institution.id;
  });

  if (sameInstitutionMatches.length === 1) {
    const existing = accounts.find((account) => account.id === sameInstitutionMatches[0].accountId);
    if (!existing) {
      throw new DatabaseConstraintError(
        new Error(`Matched Account ${sameInstitutionMatches[0].accountId} vanished mid-lookup.`)
      );
    }
    return {
      created: false,
      account: {
        id: existing.id,
        name: existing.name,
        currencyCode: existing.currencyCode,
        accountNumber: existing.accountNumber
      },
      institution: existing.institution
    };
  }
  if (sameInstitutionMatches.length > 1) {
    throw new InvalidMcpCreateInputError(
      "Multiple Accounts at this Institution already match this account number's last 4 digits — call list_accounts and ask the owner which to use."
    );
  }

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const account = await (await getAccountRepository(deps)).create({
    id,
    institutionId: institution.id,
    name,
    accountNumber,
    currencyCode
  });
  return {
    created: true,
    account: {
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountNumber: account.accountNumber
    },
    institution: { id: institution.id, name: institution.name }
  };
}

export async function listAccounts(deps: RepositoryFactoryDeps = {}) {
  const accounts = await (await getAccountRepository(deps)).listAll();
  const institutions = await (await getInstitutionRepository(deps)).listAll();
  const institutionsById = new Map(institutions.map((institution) => [institution.id, institution]));

  return accounts.map((account) => {
    const institution = institutionsById.get(account.institutionId);
    if (!institution) {
      throw new DatabaseConstraintError(
        new Error(`Account ${account.id} references unknown Institution ${account.institutionId}.`)
      );
    }
    return {
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountNumber: account.accountNumber,
      institution: { id: institution.id, name: institution.name }
    };
  });
}

export type ResolveAccountInput = {
  /** Account number as shown on the statement — often masked (e.g. "XXXX1602" or "****1602"),
   * since a bank statement typically never prints the full number. Matched by its trailing 4
   * digits, ignoring any mask characters on either side. */
  accountNumber: string;
  /** Institution name as shown on the statement (e.g. "RBL Bank"), matched case-insensitively. */
  institutionName: string;
  /** Ignored — kept optional for older MCP clients that still send create-path fields. */
  accountName?: string;
  /** Ignored — kept optional for older MCP clients that still send create-path fields. */
  currencyCode?: string;
};

export type ResolveAccountResult =
  | {
      status: "resolved";
      /** Always false — creation is via `create_account` after owner confirmation, never here. */
      created: false;
      account: { id: string; name: string; currencyCode: string; accountNumber: string | null };
      institution: { id: string; name: string };
    }
  | {
      status: "ambiguous";
      candidates: { accountId: string; name: string; accountNumber: string | null; institutionName: string }[];
    }
  | {
      /** No Account matched, but a ShareTradingAccount at the same institution/number does —
       * this statement most likely belongs there; the assistant/owner should call
       * `resolve_share_trading_account` instead. */
      status: "wrong-account-type";
      shareTradingAccountCandidates: {
        shareTradingAccountId: string;
        name: string;
        accountNumber: string | null;
        institutionName: string;
      }[];
    }
  | {
      /** No Account matched. Ask the owner which Account to use (list_accounts) or whether to
       * create one via create_institution/create_account after they confirm — never guess. */
      status: "unresolved";
      reason: "no-match";
    };

export type ResolveAccountDeps = RepositoryFactoryDeps;

/**
 * Resolves the target Account for an MCP statement import from nothing but a (usually masked)
 * account number and institution name — the one case where this server does its own deterministic
 * (never fuzzy) matching, since the statement itself never has enough digits for the assistant to
 * match exactly (docs/specs/import.md). Exactly one match returns it; zero matches returns
 * `unresolved` so the assistant asks the owner (never creates, never guesses by name/type); more
 * than one match returns every candidate (`ambiguous`) for the same reason.
 */
export async function resolveAccount(
  input: ResolveAccountInput,
  deps: ResolveAccountDeps = {}
): Promise<ResolveAccountResult> {
  const institutionName = input.institutionName.trim();
  if (institutionName.length === 0) {
    throw new InvalidAccountResolutionInputError("institutionName is required.");
  }

  const digits = input.accountNumber.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new InvalidAccountResolutionInputError(
      "accountNumber must contain at least 4 digits to match by its last 4 characters."
    );
  }
  const accountNumberSuffix = digits.slice(-4);

  const accounts = await listAccounts(deps);
  const claim = { accountNumberSuffix, institutionName };
  const candidates = accounts.map((account) => ({
    accountId: account.id,
    accountNumber: account.accountNumber,
    institutionName: account.institution.name
  }));
  const match = resolveAccountByNumberSuffix(claim, candidates);

  if (match.status === "resolved") {
    const resolved = accounts.find((account) => account.id === match.accountId);
    if (!resolved) {
      throw new DatabaseConstraintError(new Error(`Resolved Account ${match.accountId} vanished mid-lookup.`));
    }
    return {
      status: "resolved",
      created: false,
      account: {
        id: resolved.id,
        name: resolved.name,
        currencyCode: resolved.currencyCode,
        accountNumber: resolved.accountNumber
      },
      institution: resolved.institution
    };
  }

  if (match.reason === "multiple-matches") {
    // Reuses the exact same digits-only/institution-name matching resolveAccountByNumberSuffix
    // just did, rather than a second, differently-normalized filter that could disagree with it.
    const matchedAccountIds = new Set(findAccountNumberMatches(claim, candidates).map((c) => c.accountId));
    return {
      status: "ambiguous",
      candidates: accounts
        .filter((account) => matchedAccountIds.has(account.id))
        .map((account) => ({
          accountId: account.id,
          name: account.name,
          accountNumber: account.accountNumber,
          institutionName: account.institution.name
        }))
    };
  }

  // No Account match — check whether this is really a broker/demat statement that belongs on a
  // ShareTradingAccount instead (same institution/number, wrong entity type).
  const shareTradingAccounts = await listShareTradingAccounts(deps);
  const shareTradingCandidates = findAccountNumberMatches(
    claim,
    shareTradingAccounts.map((shareTradingAccount) => ({
      accountId: shareTradingAccount.id,
      accountNumber: shareTradingAccount.accountNumber,
      institutionName: shareTradingAccount.institution.name
    }))
  );
  if (shareTradingCandidates.length > 0) {
    const matchedIds = new Set(shareTradingCandidates.map((c) => c.accountId));
    return {
      status: "wrong-account-type",
      shareTradingAccountCandidates: shareTradingAccounts
        .filter((shareTradingAccount) => matchedIds.has(shareTradingAccount.id))
        .map((shareTradingAccount) => ({
          shareTradingAccountId: shareTradingAccount.id,
          name: shareTradingAccount.name,
          accountNumber: shareTradingAccount.accountNumber,
          institutionName: shareTradingAccount.institution.name
        }))
    };
  }

  // No match at all — ask the owner; never create and never guess by display name / product type.
  return { status: "unresolved", reason: "no-match" };
}

export type ImportLineItemInput = {
  /** Decimal string in the Account's currency, e.g. "-1500.00" — never a pre-scaled minor-unit integer. */
  amount: string;
  /** Calendar date (`YYYY-MM-DD`) the line item occurred on. */
  occurredAt: string;
  description: string;
  category: TransactionCategory | null;
  /** The statement's own reference/confirmation number for this line, when present — preferred over
   * date+amount for Suspected Duplicate matching (CONTEXT.md) when an existing Transaction on the
   * same Account also has one. */
  externalRef?: string | null;
};

export type StageImportInput = {
  accountId: string;
  lineItems: ImportLineItemInput[];
  /** Decimal string in the Account's currency, or null if the statement's closing balance isn't known. */
  closingBalance: string | null;
  asOfDate: string | null;
  /**
   * Statement opening balance (decimal string) paired with `openingAsOfDate`. On an Account with no
   * existing Transactions, commit/stage prepend a synthetic "Opening balance" line so the ledger
   * starts from the statement. On a non-empty Account both are ignored — subsequent-period opens
   * are already implied by prior ledger activity; any mismatch surfaces via closing-balance
   * Reconciliation on Confirm All. Omitted/`null` means no opening line.
   */
  openingBalance?: string | null;
  openingAsOfDate?: string | null;
};

export type StagedLineItem = ImportLineItemInput & {
  amountMinor: number;
  /** Matches an existing Transaction on this Account by (occurredAt, amountMinor) — advisory only. */
  isDuplicate: boolean;
};

export type StageImportResult = {
  account: { id: string; name: string; currencyCode: string; accountNumber: string | null };
  institution: { id: string; name: string };
  lineItems: StagedLineItem[];
  /**
   * The synthetic "Opening balance" line, kept separate from `lineItems` (like `closingBalanceMinor`)
   * so the assistant echoing this preview's `lineItems` straight back into `commit_import` — together
   * with the same `openingBalance`/`openingAsOfDate` — can never prepend it a second time. Null when
   * no opening line applies.
   */
  openingBalanceLine: StagedLineItem | null;
  closingBalanceMinor: number | null;
  asOfDate: string | null;
};

async function resolveAccountAndInstitution(accountId: string, deps: RepositoryFactoryDeps) {
  const account = await (await getAccountRepository(deps)).getById(accountId);
  if (!account) {
    throw new DatabaseConstraintError(new Error(`Account ${accountId} does not exist.`));
  }
  const institution = await (await getInstitutionRepository(deps)).getById(account.institutionId);
  if (!institution) {
    throw new DatabaseConstraintError(
      new Error(`Account ${account.id} references unknown Institution ${account.institutionId}.`)
    );
  }
  return { account, institution };
}

function assertValidLineItemCategory(amountMinor: number, category: TransactionCategory | null): void {
  if (category !== null) {
    assertValidCategoryForKind(amountMinor >= 0 ? "Income" : "Expense", category);
  }
}

/**
 * Validates the opening-balance pair and, when both are present, its decimal format — unconditionally,
 * regardless of whether the Account turns out to be empty, the same way `closingBalance` is always
 * parsed. Returns the parsed minor-unit amount alongside the raw pair (null when omitted).
 */
function normalizeOpeningBalancePair(
  input: StageImportInput,
  currencyCode: string
): {
  openingBalance: string | null;
  openingAsOfDate: string | null;
  openingBalanceMinor: number | null;
} {
  const openingBalance = input.openingBalance ?? null;
  const openingAsOfDate = input.openingAsOfDate ?? null;
  assertValidOpeningBalance(openingBalance, openingAsOfDate);
  if (openingAsOfDate !== null) {
    assertValidCalendarDate(openingAsOfDate);
  }
  const openingBalanceMinor = openingBalance !== null ? parseDecimalToMinorUnits(openingBalance, currencyCode) : null;
  return { openingBalance, openingAsOfDate, openingBalanceMinor };
}

/**
 * The synthetic "Opening balance" line item, only when the Account is empty and a non-zero opening
 * balance/date pair was supplied. Non-empty Accounts ignore opening (statement lines still import).
 */
function computeOpeningLineItem(
  openingBalance: string | null,
  openingAsOfDate: string | null,
  openingBalanceMinor: number | null,
  accountIsEmpty: boolean
): ImportLineItemInput | null {
  if (!accountIsEmpty || openingBalance === null || openingAsOfDate === null || openingBalanceMinor === 0) {
    return null;
  }
  return {
    amount: openingBalance,
    occurredAt: openingAsOfDate,
    description: OPENING_BALANCE_DESCRIPTION,
    category: null
  };
}

export async function stageImport(
  input: StageImportInput,
  deps: RepositoryFactoryDeps = {}
): Promise<StageImportResult> {
  const { account, institution } = await resolveAccountAndInstitution(input.accountId, deps);

  assertValidClosingBalance(input.closingBalance, input.asOfDate);
  if (input.asOfDate !== null) {
    assertValidCalendarDate(input.asOfDate);
  }
  const { openingBalance, openingAsOfDate, openingBalanceMinor } = normalizeOpeningBalancePair(
    input,
    account.currencyCode
  );

  const existingTransactions = await (await getTransactionRepository(deps)).listByAccountId(input.accountId);
  // Matches by calendar date, not exact timestamp: a manually-entered Transaction carries a real
  // time-of-day, so an exact-timestamp match would only ever catch a re-import of a previously
  // imported (midnight-UTC) row. Duplicate flagging is advisory only (never blocks commit_import),
  // so a false positive is cheap and a miss is expensive.
  const seenKeys = new Set(
    existingTransactions.map((transaction) => `${transaction.occurredAt.slice(0, 10)}|${transaction.amountMinor}`)
  );
  // A ref-numbered line is preferred over date+amount when an existing Transaction also has one
  // (mirrors ImportBatchRepository.create(), which actually persists the match at commit time).
  const seenExternalRefs = new Set(
    existingTransactions.flatMap((transaction) => (transaction.externalRef !== null ? [transaction.externalRef] : []))
  );

  const stageLineItem = (lineItem: ImportLineItemInput): StagedLineItem => {
    assertValidCalendarDate(lineItem.occurredAt);
    const amountMinor = parseDecimalToMinorUnits(lineItem.amount, account.currencyCode);
    assertValidLineItemCategory(amountMinor, lineItem.category);

    // Also catches a repeat within this same batch (an OCR/AI extraction glitch, or a genuinely
    // duplicated statement line) — the first occurrence of a key is never flagged (it's "the
    // original"), only a later line item that repeats it.
    const key = `${lineItem.occurredAt}|${amountMinor}`;
    const externalRef = lineItem.externalRef ?? null;
    const isDuplicate = (externalRef !== null && seenExternalRefs.has(externalRef)) || seenKeys.has(key);
    seenKeys.add(key);
    if (externalRef !== null) {
      seenExternalRefs.add(externalRef);
    }

    return { ...lineItem, amountMinor, isDuplicate };
  };

  // Opening line (when present) is staged first so it's counted as "seen" for duplicate-flagging
  // against the statement lines that follow, but it is returned separately from `lineItems` below —
  // never folded in — so echoing this preview's `lineItems` back into `commit_import` (with the same
  // openingBalance/openingAsOfDate) can never prepend the opening amount a second time.
  const openingLineItemInput = computeOpeningLineItem(
    openingBalance,
    openingAsOfDate,
    openingBalanceMinor,
    existingTransactions.length === 0
  );
  const openingBalanceLine = openingLineItemInput !== null ? stageLineItem(openingLineItemInput) : null;
  const lineItems = input.lineItems.map(stageLineItem);

  return {
    account: {
      id: account.id,
      name: account.name,
      currencyCode: account.currencyCode,
      accountNumber: account.accountNumber
    },
    institution: { id: institution.id, name: institution.name },
    lineItems,
    openingBalanceLine,
    closingBalanceMinor:
      input.closingBalance !== null ? parseDecimalToMinorUnits(input.closingBalance, account.currencyCode) : null,
    asOfDate: input.asOfDate
  };
}

export type CommitImportInput = StageImportInput & {
  source: string;
  /** Optional: when set, retrying commit_import with the exact same key returns the existing
   * ImportBatch instead of creating a duplicate — protects against an MCP client retrying after a
   * dropped/ambiguous HTTP response (MCP here is stateless per-request, so no session-level
   * de-duplication exists otherwise). Omitted, this call behaves exactly as before: always a new
   * ImportBatch with random ids. */
  idempotencyKey?: string;
};
export type CommitImportDeps = RepositoryFactoryDeps & { newId?: () => string };

export async function commitImport(input: CommitImportInput, deps: CommitImportDeps = {}): Promise<ImportBatch> {
  const account = await (await getAccountRepository(deps)).getById(input.accountId);
  if (!account) {
    throw new DatabaseConstraintError(new Error(`Account ${input.accountId} does not exist.`));
  }

  const { openingBalance, openingAsOfDate, openingBalanceMinor } = normalizeOpeningBalancePair(
    input,
    account.currencyCode
  );
  const existingTransactions = await (await getTransactionRepository(deps)).listByAccountId(input.accountId);
  const openingLineItem = computeOpeningLineItem(
    openingBalance,
    openingAsOfDate,
    openingBalanceMinor,
    existingTransactions.length === 0
  );
  const effectiveLineItems = openingLineItem !== null ? [openingLineItem, ...input.lineItems] : input.lineItems;

  for (const lineItem of effectiveLineItems) {
    if (lineItem.category !== null) {
      const amountMinor = parseDecimalToMinorUnits(lineItem.amount, account.currencyCode);
      assertValidLineItemCategory(amountMinor, lineItem.category);
    }
  }

  const importBatches = await getImportBatchRepository(deps);
  const newId =
    input.idempotencyKey !== undefined
      ? idempotentIdSequence("commit_import", input.idempotencyKey)
      : (deps.newId ?? (() => crypto.randomUUID()));

  if (input.idempotencyKey !== undefined) {
    const existing = await importBatches.getById(uuidFromHash(`commit_import:${input.idempotencyKey}:0`));
    if (existing) {
      return existing;
    }
  }

  const create = () =>
    importBatches.create(
      {
        id: newId(),
        accountId: input.accountId,
        source: input.source,
        createdAt: new Date().toISOString(),
        closingBalance: input.closingBalance,
        asOfDate: input.asOfDate
      },
      effectiveLineItems.map((lineItem) => ({
        id: newId(),
        amount: lineItem.amount,
        occurredAt: lineItem.occurredAt,
        description: lineItem.description,
        category: lineItem.category,
        externalRef: lineItem.externalRef ?? null
      }))
    );

  try {
    return await create();
  } catch (error) {
    // Two concurrent calls with the same idempotencyKey (or a genuine retry racing its own prior
    // attempt) can both pass the getById check above before either writes — the loser hits a
    // duplicate deterministic id. Re-load and return the winner's batch instead of failing the retry.
    if (input.idempotencyKey !== undefined && error instanceof DatabaseConstraintError) {
      const existing = await importBatches.getById(uuidFromHash(`commit_import:${input.idempotencyKey}:0`));
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

export async function listShareTradingAccounts(deps: RepositoryFactoryDeps = {}) {
  const shareTradingAccounts = await (await getShareTradingAccountRepository(deps)).listAll();
  const institutions = await (await getInstitutionRepository(deps)).listAll();
  const institutionsById = new Map(institutions.map((institution) => [institution.id, institution]));

  return shareTradingAccounts.map((shareTradingAccount) => {
    const institution = institutionsById.get(shareTradingAccount.institutionId);
    if (!institution) {
      throw new DatabaseConstraintError(
        new Error(
          `ShareTradingAccount ${shareTradingAccount.id} references unknown Institution ${shareTradingAccount.institutionId}.`
        )
      );
    }
    return {
      id: shareTradingAccount.id,
      name: shareTradingAccount.name,
      currencyCode: shareTradingAccount.currencyCode,
      accountNumber: shareTradingAccount.accountNumber,
      institution: { id: institution.id, name: institution.name }
    };
  });
}

export type CreateShareTradingAccountInput = {
  institutionId: string;
  name: string;
  currencyCode: string;
  accountNumber: string;
  confirmed: boolean;
};

export type CreateShareTradingAccountResult = {
  created: boolean;
  shareTradingAccount: { id: string; name: string; currencyCode: string; accountNumber: string | null };
  institution: { id: string; name: string };
};

export type CreateShareTradingAccountDeps = RepositoryFactoryDeps & { newId?: () => string };

/**
 * Creates a ShareTradingAccount after owner confirmation. Reuses an existing one at the same
 * Institution with the same last-4 account digits (`created: false`) instead of duplicating.
 */
export async function createShareTradingAccount(
  input: CreateShareTradingAccountInput,
  deps: CreateShareTradingAccountDeps = {}
): Promise<CreateShareTradingAccountResult> {
  assertOwnerConfirmed(input.confirmed, "create_share_trading_account");

  const name = requireTrimmedName(input.name);
  const accountNumber = requireAccountNumberWithLast4(input.accountNumber);
  const currencyCode = requireCurrencyCode(input.currencyCode);

  const institution = await (await getInstitutionRepository(deps)).getById(input.institutionId);
  if (!institution) {
    throw new DatabaseConstraintError(new Error(`Institution ${input.institutionId} does not exist.`));
  }

  const suffix = accountNumberSuffix(accountNumber);
  const claim = { accountNumberSuffix: suffix, institutionName: institution.name };

  const accounts = await listAccounts(deps);
  const bankMatches = findAccountNumberMatches(
    claim,
    accounts.map((account) => ({
      accountId: account.id,
      accountNumber: account.accountNumber,
      institutionName: account.institution.name
    }))
  );
  if (bankMatches.length > 0) {
    throw new InvalidMcpCreateInputError(
      "An Account already matches this account number and Institution — use create_account or resolve_account instead."
    );
  }

  const shareTradingAccounts = await listShareTradingAccounts(deps);
  const sameInstitutionMatches = findAccountNumberMatches(
    claim,
    shareTradingAccounts.map((shareTradingAccount) => ({
      accountId: shareTradingAccount.id,
      accountNumber: shareTradingAccount.accountNumber,
      institutionName: shareTradingAccount.institution.name
    }))
  ).filter((match) => {
    const shareTradingAccount = shareTradingAccounts.find(
      (candidate) => candidate.id === match.accountId
    );
    return shareTradingAccount?.institution.id === institution.id;
  });

  if (sameInstitutionMatches.length === 1) {
    const existing = shareTradingAccounts.find(
      (shareTradingAccount) => shareTradingAccount.id === sameInstitutionMatches[0].accountId
    );
    if (!existing) {
      throw new DatabaseConstraintError(
        new Error(`Matched ShareTradingAccount ${sameInstitutionMatches[0].accountId} vanished mid-lookup.`)
      );
    }
    return {
      created: false,
      shareTradingAccount: {
        id: existing.id,
        name: existing.name,
        currencyCode: existing.currencyCode,
        accountNumber: existing.accountNumber
      },
      institution: existing.institution
    };
  }
  if (sameInstitutionMatches.length > 1) {
    throw new InvalidMcpCreateInputError(
      "Multiple ShareTradingAccounts at this Institution already match this account number's last 4 digits — call list_share_trading_accounts and ask the owner which to use."
    );
  }

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const created = await (await getShareTradingAccountRepository(deps)).create({
    id,
    institutionId: institution.id,
    name,
    accountNumber,
    currencyCode
  });
  return {
    created: true,
    shareTradingAccount: {
      id: created.id,
      name: created.name,
      currencyCode: created.currencyCode,
      accountNumber: created.accountNumber
    },
    institution: { id: institution.id, name: institution.name }
  };
}

export type ResolveShareTradingAccountInput = {
  /** Account number as shown on the confirmation — often masked. Matched by its trailing 4 digits. */
  accountNumber: string;
  /** Institution (broker) name as shown, matched case-insensitively. */
  institutionName: string;
  /** Ignored — kept optional for older MCP clients that still send create-path fields. */
  accountName?: string;
  /** Ignored — kept optional for older MCP clients that still send create-path fields. */
  currencyCode?: string;
};

export type ResolveShareTradingAccountResult =
  | {
      status: "resolved";
      /** Always false — creation is via `create_share_trading_account` after owner confirmation. */
      created: false;
      shareTradingAccount: { id: string; name: string; currencyCode: string; accountNumber: string | null };
      institution: { id: string; name: string };
    }
  | {
      status: "ambiguous";
      candidates: {
        shareTradingAccountId: string;
        name: string;
        accountNumber: string | null;
        institutionName: string;
      }[];
    }
  | {
      /** No ShareTradingAccount matched, but an Account at the same institution/number does —
       * this statement most likely belongs there instead. */
      status: "wrong-account-type";
      accountCandidates: { accountId: string; name: string; accountNumber: string | null; institutionName: string }[];
    }
  | {
      /** No ShareTradingAccount matched. Ask the owner which to use, or create via
       * create_institution/create_share_trading_account after they confirm. */
      status: "unresolved";
      reason: "no-match";
    };

export type ResolveShareTradingAccountDeps = RepositoryFactoryDeps;

/**
 * Same deterministic (never fuzzy) matching as resolveAccount (docs/specs/import.md), for
 * ShareTradingAccount instead of Account — reuses resolveAccountByNumberSuffix unchanged
 * (docs/specs/share-trading.md). Zero matches returns `unresolved` (never creates).
 */
export async function resolveShareTradingAccount(
  input: ResolveShareTradingAccountInput,
  deps: ResolveShareTradingAccountDeps = {}
): Promise<ResolveShareTradingAccountResult> {
  const institutionName = input.institutionName.trim();
  if (institutionName.length === 0) {
    throw new InvalidAccountResolutionInputError("institutionName is required.");
  }

  const digits = input.accountNumber.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new InvalidAccountResolutionInputError(
      "accountNumber must contain at least 4 digits to match by its last 4 characters."
    );
  }
  const accountNumberSuffix = digits.slice(-4);

  const shareTradingAccounts = await listShareTradingAccounts(deps);
  const claim = { accountNumberSuffix, institutionName };
  const candidates = shareTradingAccounts.map((shareTradingAccount) => ({
    accountId: shareTradingAccount.id,
    accountNumber: shareTradingAccount.accountNumber,
    institutionName: shareTradingAccount.institution.name
  }));
  const match = resolveAccountByNumberSuffix(claim, candidates);

  if (match.status === "resolved") {
    const resolved = shareTradingAccounts.find(
      (shareTradingAccount) => shareTradingAccount.id === match.accountId
    );
    if (!resolved) {
      throw new DatabaseConstraintError(
        new Error(`Resolved ShareTradingAccount ${match.accountId} vanished mid-lookup.`)
      );
    }
    return {
      status: "resolved",
      created: false,
      shareTradingAccount: {
        id: resolved.id,
        name: resolved.name,
        currencyCode: resolved.currencyCode,
        accountNumber: resolved.accountNumber
      },
      institution: resolved.institution
    };
  }

  if (match.reason === "multiple-matches") {
    // Reuses the exact same digits-only/institution-name matching resolveAccountByNumberSuffix
    // just did, rather than a second, differently-normalized filter that could disagree with it.
    const matchedIds = new Set(findAccountNumberMatches(claim, candidates).map((c) => c.accountId));
    return {
      status: "ambiguous",
      candidates: shareTradingAccounts
        .filter((shareTradingAccount) => matchedIds.has(shareTradingAccount.id))
        .map((shareTradingAccount) => ({
          shareTradingAccountId: shareTradingAccount.id,
          name: shareTradingAccount.name,
          accountNumber: shareTradingAccount.accountNumber,
          institutionName: shareTradingAccount.institution.name
        }))
    };
  }

  // No ShareTradingAccount match — check whether this is really a bank statement that belongs on
  // an Account instead (same institution/number, wrong entity type).
  const accounts = await listAccounts(deps);
  const accountCandidateMatches = findAccountNumberMatches(
    claim,
    accounts.map((account) => ({
      accountId: account.id,
      accountNumber: account.accountNumber,
      institutionName: account.institution.name
    }))
  );
  if (accountCandidateMatches.length > 0) {
    const matchedIds = new Set(accountCandidateMatches.map((c) => c.accountId));
    return {
      status: "wrong-account-type",
      accountCandidates: accounts
        .filter((account) => matchedIds.has(account.id))
        .map((account) => ({
          accountId: account.id,
          name: account.name,
          accountNumber: account.accountNumber,
          institutionName: account.institution.name
        }))
    };
  }

  // No match at all — ask the owner; never create and never guess.
  return { status: "unresolved", reason: "no-match" };
}

export type StockImportLineItemInput = {
  scripCode: string;
  type: StockTransactionType;
  /** Decimal string, whole shares only, e.g. "10" — never a pre-parsed number. */
  quantity: string;
  /** Decimal string in the ShareTradingAccount's currency, e.g. "150.00". */
  price: string;
  /** Calendar date (`YYYY-MM-DD`) the trade occurred on. */
  occurredAt: string;
  description: string;
  /** The broker statement's own reference/order/contract-note number for this line, when present —
   * preferred over the natural key for Suspected Duplicate matching (CONTEXT.md) when an existing
   * StockTransaction on the same ShareTradingAccount also has one. */
  externalRef?: string | null;
};

export type StageStockImportInput = {
  shareTradingAccountId: string;
  lineItems: StockImportLineItemInput[];
};

export type StagedStockLineItem = StockImportLineItemInput & {
  quantityParsed: number;
  pricePerUnitMinor: number;
  /** Matches an existing StockTransaction on this ShareTradingAccount by (occurredAt, scripCode,
   * type, quantity, pricePerUnitMinor) — advisory only, mirroring stage_import's duplicate rule. */
  isDuplicate: boolean;
};

export type StageStockImportResult = {
  shareTradingAccount: { id: string; name: string; currencyCode: string; accountNumber: string | null };
  institution: { id: string; name: string };
  lineItems: StagedStockLineItem[];
};

async function resolveShareTradingAccountAndInstitution(
  shareTradingAccountId: string,
  deps: RepositoryFactoryDeps
) {
  const shareTradingAccount = await (await getShareTradingAccountRepository(deps)).getById(shareTradingAccountId);
  if (!shareTradingAccount) {
    throw new DatabaseConstraintError(new Error(`ShareTradingAccount ${shareTradingAccountId} does not exist.`));
  }
  const institution = await (await getInstitutionRepository(deps)).getById(shareTradingAccount.institutionId);
  if (!institution) {
    throw new DatabaseConstraintError(
      new Error(
        `ShareTradingAccount ${shareTradingAccount.id} references unknown Institution ${shareTradingAccount.institutionId}.`
      )
    );
  }
  return { shareTradingAccount, institution };
}

export async function stageStockImport(
  input: StageStockImportInput,
  deps: RepositoryFactoryDeps = {}
): Promise<StageStockImportResult> {
  const { shareTradingAccount, institution } = await resolveShareTradingAccountAndInstitution(
    input.shareTradingAccountId,
    deps
  );

  const existingStockTransactions = await (
    await getStockTransactionRepository(deps)
  ).listByShareTradingAccountId(input.shareTradingAccountId);
  const seenKeys = new Set(
    existingStockTransactions.map(
      (stockTransaction) =>
        `${stockTransaction.occurredAt.slice(0, 10)}|${stockTransaction.scripCode}|${stockTransaction.type}|${stockTransaction.quantity}|${stockTransaction.pricePerUnitMinor}`
    )
  );
  // A ref-numbered line is preferred over the natural key when an existing StockTransaction also
  // has one (mirrors StockImportBatchRepository.create(), which persists the match at commit time).
  const seenExternalRefs = new Set(
    existingStockTransactions.flatMap((stockTransaction) =>
      stockTransaction.externalRef !== null ? [stockTransaction.externalRef] : []
    )
  );

  const lineItems = input.lineItems.map((lineItem) => {
    assertValidCalendarDate(lineItem.occurredAt);
    const quantityParsed = parseWholeShareQuantity(lineItem.quantity);
    const pricePerUnitMinor = parseDecimalToMinorUnits(lineItem.price, shareTradingAccount.currencyCode);
    const scripCode = lineItem.scripCode.trim().toUpperCase();

    const key = `${lineItem.occurredAt}|${scripCode}|${lineItem.type}|${quantityParsed}|${pricePerUnitMinor}`;
    const externalRef = lineItem.externalRef ?? null;
    const isDuplicate = (externalRef !== null && seenExternalRefs.has(externalRef)) || seenKeys.has(key);
    seenKeys.add(key);
    if (externalRef !== null) {
      seenExternalRefs.add(externalRef);
    }

    return {
      ...lineItem,
      scripCode,
      quantityParsed,
      pricePerUnitMinor,
      isDuplicate
    };
  });

  return {
    shareTradingAccount: {
      id: shareTradingAccount.id,
      name: shareTradingAccount.name,
      currencyCode: shareTradingAccount.currencyCode,
      accountNumber: shareTradingAccount.accountNumber
    },
    institution: { id: institution.id, name: institution.name },
    lineItems
  };
}

export type CommitStockImportInput = StageStockImportInput & {
  source: string;
  /** Optional: same retry-safe idempotency key as commit_import — see that type's doc comment. */
  idempotencyKey?: string;
};
export type CommitStockImportDeps = RepositoryFactoryDeps & { newId?: () => string };

export async function commitStockImport(
  input: CommitStockImportInput,
  deps: CommitStockImportDeps = {}
): Promise<StockImportBatch> {
  const stockImportBatches = await getStockImportBatchRepository(deps);
  const newId =
    input.idempotencyKey !== undefined
      ? idempotentIdSequence("commit_stock_import", input.idempotencyKey)
      : (deps.newId ?? (() => crypto.randomUUID()));

  if (input.idempotencyKey !== undefined) {
    const existing = await stockImportBatches.getById(uuidFromHash(`commit_stock_import:${input.idempotencyKey}:0`));
    if (existing) {
      return existing;
    }
  }

  const create = () =>
    stockImportBatches.create(
      {
        id: newId(),
        shareTradingAccountId: input.shareTradingAccountId,
        source: input.source,
        createdAt: new Date().toISOString()
      },
      input.lineItems.map((lineItem) => ({
        id: newId(),
        scripCode: lineItem.scripCode,
        type: lineItem.type,
        quantity: lineItem.quantity,
        price: lineItem.price,
        occurredAt: lineItem.occurredAt,
        description: lineItem.description,
        externalRef: lineItem.externalRef ?? null
      }))
    );

  try {
    return await create();
  } catch (error) {
    if (input.idempotencyKey !== undefined && error instanceof DatabaseConstraintError) {
      const existing = await stockImportBatches.getById(
        uuidFromHash(`commit_stock_import:${input.idempotencyKey}:0`)
      );
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}
