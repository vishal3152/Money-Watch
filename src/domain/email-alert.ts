import { assertValidCalendarDate, InvalidCalendarDateError } from "@/domain/calendar-date";

export type EmailAlertDirection = "credit" | "debit";

export type ParsedEmailAlert = {
  direction: EmailAlertDirection;
  /** Decimal string, e.g. "1282.05" — never a pre-scaled minor-unit integer. */
  amount: string;
  /** Claimed currency (e.g. "INR") — must equal the resolved Account's currency before import. */
  currencyCode: string;
  /** Calendar date (`YYYY-MM-DD`) the alert says the transaction occurred on. */
  occurredAt: string;
  /** Masked account number's trailing digits, e.g. "1602" from "XXXX1602". */
  accountNumberSuffix: string;
  /** Claimed institution name, e.g. "RBL Bank" — used only for deterministic Account matching. */
  institutionName: string;
  description: string;
  reference: string | null;
  /** Claimed available balance as a decimal string, or null if the alert didn't state one. */
  balance: string | null;
};

export class InvalidEmailAlertError extends Error {
  constructor(public readonly reason: string) {
    super(`The parsed email alert is missing or has an invalid "${reason}" field.`);
    this.name = "InvalidEmailAlertError";
  }
}

/**
 * An alert's fields exactly as the LLM produced them — every field a raw string (or null when the
 * LLM omitted it or returned a non-string). Unlike `ParsedEmailAlert` this is *not* trusted: it is
 * what gets stored for an unresolved alert so the owner can see and correct whatever the LLM got
 * wrong before it is imported (docs/specs/email-alert-sync.md).
 */
export type EmailAlertDraft = {
  [Field in keyof ParsedEmailAlert]: string | null;
};

export type EmailAlertValidation =
  | { valid: true; alert: ParsedEmailAlert }
  | { valid: false; draft: EmailAlertDraft; invalidFields: string[] };

const EMPTY_DRAFT: EmailAlertDraft = {
  direction: null,
  amount: null,
  currencyCode: null,
  occurredAt: null,
  accountNumberSuffix: null,
  institutionName: null,
  description: null,
  reference: null,
  balance: null
};

function draftValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// Plain unsigned decimal only — no thousands separators, currency symbols/prefixes, or a sign the
// LLM applied itself (direction/toSignedAmount is the only place a sign is ever added). Digit-count
// vs. the resolved Account's actual currency is checked later, by parseDecimalToMinorUnits.
const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;
// Balance is a real account balance, which can be negative (e.g. an overdraft) — same shape, with
// an optional leading sign.
const SIGNED_DECIMAL = /^-?\d+(?:\.\d+)?$/;

function isValidCalendarDateString(value: unknown): boolean {
  if (!isNonEmptyString(value)) {
    return false;
  }
  try {
    assertValidCalendarDate(value);
    return true;
  } catch (error) {
    if (error instanceof InvalidCalendarDateError) {
      return false;
    }
    throw error;
  }
}

type FieldCheck = (value: unknown) => boolean;

/** One check per alert field, in the order the owner reads them. Both validators below run these,
 * so an LLM payload and an owner's own correction can never be judged by different rules. */
const FIELD_CHECKS: Record<keyof ParsedEmailAlert, FieldCheck> = {
  direction: (value) => value === "credit" || value === "debit",
  amount: (value) => isNonEmptyString(value) && UNSIGNED_DECIMAL.test(value.trim()),
  currencyCode: isNonEmptyString,
  occurredAt: isValidCalendarDateString,
  // Short suffixes (e.g. "2") uniquely match the wrong Account too easily via endsWith.
  accountNumberSuffix: (value) => isNonEmptyString(value) && value.trim().length >= 4,
  institutionName: isNonEmptyString,
  description: isNonEmptyString,
  reference: isNullableString,
  balance: (value) =>
    isNullableString(value) && (value === null || SIGNED_DECIMAL.test(value.trim()))
};

const ALERT_FIELDS = Object.keys(FIELD_CHECKS) as (keyof ParsedEmailAlert)[];

/** The only fields that reach the ledger. An alert's claimed balance, reference, institution name
 * and account-number suffix never do (docs/specs/email-alert-sync.md) — the owner picks the Account
 * directly when resolving by hand, so a suffix or balance the LLM mangled must not block the
 * import. */
const IMPORTABLE_FIELDS = ["direction", "amount", "currencyCode", "occurredAt", "description"] as const;

export type ImportableEmailAlert = Pick<ParsedEmailAlert, (typeof IMPORTABLE_FIELDS)[number]>;

export type ImportableEmailAlertValidation =
  | { valid: true; alert: ImportableEmailAlert }
  | { valid: false; invalidFields: string[] };

function invalidFieldsOf(
  fields: readonly (keyof ParsedEmailAlert)[],
  values: Record<string, unknown>
): string[] {
  return fields.filter((field) => !FIELD_CHECKS[field](values[field]));
}

/**
 * Validates an LLM response field by field, reporting *every* field that failed rather than
 * throwing on the first — an alert the sender/subject pre-filter already judged to be a real bank
 * transaction alert is kept as an unresolved alert the owner can correct, and that only works if
 * the owner is told which fields to fix (docs/specs/email-alert-sync.md). `raw` is untrusted (an
 * LLM's structured-output response, not a typed value).
 */
export function validateEmailAlertFields(raw: unknown): EmailAlertValidation {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, draft: { ...EMPTY_DRAFT }, invalidFields: ["payload"] };
  }
  const alert = raw as Record<string, unknown>;
  const invalidFields = invalidFieldsOf(ALERT_FIELDS, alert);

  if (invalidFields.length > 0) {
    const draft = { ...EMPTY_DRAFT };
    for (const field of ALERT_FIELDS) {
      draft[field] = draftValue(alert[field]);
    }
    return { valid: false, draft, invalidFields };
  }

  return {
    valid: true,
    alert: {
      direction: alert.direction as EmailAlertDirection,
      amount: alert.amount as string,
      currencyCode: (alert.currencyCode as string).trim().toUpperCase(),
      occurredAt: alert.occurredAt as string,
      accountNumberSuffix: (alert.accountNumberSuffix as string).trim(),
      institutionName: (alert.institutionName as string).trim(),
      description: alert.description as string,
      reference: alert.reference as string | null,
      balance: alert.balance as string | null
    }
  };
}

/**
 * Validates the fields an owner corrected while resolving an alert on `/imports` — the same checks
 * `validateEmailAlertFields` applies, narrowed to the fields the import actually uses.
 */
export function validateImportableEmailAlert(raw: unknown): ImportableEmailAlertValidation {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, invalidFields: ["payload"] };
  }
  const values = raw as Record<string, unknown>;
  const invalidFields = invalidFieldsOf(IMPORTABLE_FIELDS, values);

  if (invalidFields.length > 0) {
    return { valid: false, invalidFields };
  }

  return {
    valid: true,
    alert: {
      direction: values.direction as EmailAlertDirection,
      amount: values.amount as string,
      currencyCode: (values.currencyCode as string).trim().toUpperCase(),
      occurredAt: values.occurredAt as string,
      description: values.description as string
    }
  };
}

/**
 * Validates and normalizes an LLM response into a `ParsedEmailAlert` before anything
 * else touches it, throwing on the first invalid field. Use `validateEmailAlertFields` where the
 * caller can offer the owner a correction instead of discarding the alert.
 */
export function validateParsedEmailAlert(raw: unknown): ParsedEmailAlert {
  const result = validateEmailAlertFields(raw);
  if (!result.valid) {
    throw new InvalidEmailAlertError(result.invalidFields[0]);
  }
  return result.alert;
}

/** Opens a validated alert back up for owner editing (an alert that parsed cleanly but could not
 * be matched to an Account is stored the same way as one with invalid fields). */
export function toEmailAlertDraft(alert: ParsedEmailAlert): EmailAlertDraft {
  return { ...alert };
}

/**
 * Converts an alert's unsigned claimed amount into the signed decimal string the rest of this
 * app's Transaction amounts use (positive Income, negative Expense) — a credit alert is Income,
 * a debit alert is Expense.
 */
export function toSignedAmount(alert: { direction: EmailAlertDirection; amount: string }): string {
  return alert.direction === "debit" ? `-${alert.amount}` : alert.amount;
}

/** Slack around the email's own received date: a same-day alert can legitimately land a day
 * either side of its claimed occurredAt across a timezone/day boundary, or a bank's own send delay. */
const OCCURRED_AT_TOLERANCE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sanity-checks a validated alert's claimed `occurredAt` against the email's own received date —
 * an LLM-hallucinated date (wrong year, a date far in the future) is otherwise accepted as long as
 * it's shaped like `YYYY-MM-DD`, silently booking a Transaction in the wrong period. `receivedAtIso`
 * is null when the message's `Date` header couldn't be parsed; the check is skipped (returns true)
 * rather than rejecting a message purely because that metadata is missing.
 */
export function isOccurredAtPlausible(occurredAt: string, receivedAtIso: string | null): boolean {
  if (receivedAtIso === null) {
    return true;
  }
  const occurredAtMs = new Date(`${occurredAt}T00:00:00.000Z`).getTime();
  const receivedAtMs = new Date(receivedAtIso).getTime();
  if (Number.isNaN(occurredAtMs) || Number.isNaN(receivedAtMs)) {
    return true;
  }
  return Math.abs(occurredAtMs - receivedAtMs) <= OCCURRED_AT_TOLERANCE_DAYS * MS_PER_DAY;
}
