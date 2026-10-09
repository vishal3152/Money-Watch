import { describe, expect, it } from "vitest";

import {
  InvalidEmailAlertError,
  isOccurredAtPlausible,
  toEmailAlertDraft,
  toSignedAmount,
  validateEmailAlertFields,
  validateImportableEmailAlert,
  validateParsedEmailAlert
} from "@/domain/email-alert";

// Worked example from docs/specs/email-alert-sync.md: RBL Bank's debit/credit alert email.
// "Greetings from RBL Bank! This is to inform you that your account XXXX1602 is credited
// with INR 1282.05 on 09-09-2026 15:02:13 ref NEFT/IN22625213464969/CENTRAL DEPOSITORY
// SERVICES. Your available balance is INR 468531.58. Regards, RBL Bank Ltd."
const validRblAlert = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  accountNumberSuffix: "1602",
  institutionName: "RBL Bank",
  description: "NEFT/IN22625213464969/CENTRAL DEPOSITORY SERVICES",
  reference: "NEFT/IN22625213464969",
  balance: "468531.58"
};

describe("validateParsedEmailAlert", () => {
  it("accepts a well-formed alert and returns it unchanged", () => {
    expect(validateParsedEmailAlert(validRblAlert)).toEqual(validRblAlert);
  });

  it("rejects a direction that isn't credit or debit", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, direction: "sideways" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("rejects a missing required field", () => {
    const { amount: _amount, ...withoutAmount } = validRblAlert;
    expect(() => validateParsedEmailAlert(withoutAmount)).toThrow(InvalidEmailAlertError);
  });

  it("rejects an occurredAt that isn't a valid calendar date", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, occurredAt: "09-09-2026" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("accepts null for the optional reference and balance fields", () => {
    const alert = { ...validRblAlert, reference: null, balance: null };
    expect(validateParsedEmailAlert(alert)).toEqual(alert);
  });

  it("rejects a non-object payload", () => {
    expect(() => validateParsedEmailAlert("not an object")).toThrow(InvalidEmailAlertError);
  });

  it("rejects an account-number suffix shorter than 4 characters", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, accountNumberSuffix: "02" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("normalizes currencyCode to uppercase", () => {
    expect(validateParsedEmailAlert({ ...validRblAlert, currencyCode: "inr" }).currencyCode).toBe("INR");
  });

  it("trims whitespace from institutionName, matching accountNumberSuffix/currencyCode — an LLM-padded name would otherwise never match an existing Institution's exact name in resolveAccountByNumberSuffix", () => {
    expect(
      validateParsedEmailAlert({ ...validRblAlert, institutionName: " RBL Bank " }).institutionName
    ).toBe("RBL Bank");
  });

  it("rejects an amount with a thousands separator", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, amount: "1,282.05" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("rejects an amount with a currency symbol/prefix", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, amount: "INR 1282.05" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("rejects an amount the LLM already signed negative", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, amount: "-1282.05" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("rejects a non-numeric amount", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, amount: "not available" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("accepts a whole-number amount with no decimal point", () => {
    expect(validateParsedEmailAlert({ ...validRblAlert, amount: "500" }).amount).toBe("500");
  });

  it("rejects a non-numeric balance", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, balance: "Not available" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("rejects a balance with a thousands separator", () => {
    expect(() => validateParsedEmailAlert({ ...validRblAlert, balance: "4,68,531.58" })).toThrow(
      InvalidEmailAlertError
    );
  });

  it("accepts a negative balance (overdraft account)", () => {
    expect(validateParsedEmailAlert({ ...validRblAlert, balance: "-500.00" }).balance).toBe("-500.00");
  });
});

describe("isOccurredAtPlausible", () => {
  it("accepts an occurredAt the same day the email was received", () => {
    expect(isOccurredAtPlausible("2026-09-09", "2026-09-09T15:02:13.000Z")).toBe(true);
  });

  it("accepts an occurredAt a day or two off the received date (timezone/day-boundary slack)", () => {
    expect(isOccurredAtPlausible("2026-09-08", "2026-09-09T15:02:13.000Z")).toBe(true);
  });

  it("rejects an occurredAt with the wrong year — a hallucinated date far from when the email arrived", () => {
    expect(isOccurredAtPlausible("2025-09-09", "2026-09-09T15:02:13.000Z")).toBe(false);
  });

  it("rejects an occurredAt far in the future relative to the received date", () => {
    expect(isOccurredAtPlausible("2026-12-25", "2026-09-09T15:02:13.000Z")).toBe(false);
  });

  it("accepts any occurredAt when the email's received date could not be determined", () => {
    expect(isOccurredAtPlausible("2025-01-01", null)).toBe(true);
  });
});

describe("toSignedAmount", () => {
  it("leaves a credit's amount positive", () => {
    expect(toSignedAmount({ direction: "credit", amount: "1282.05" })).toBe("1282.05");
  });

  it("makes a debit's amount negative", () => {
    expect(toSignedAmount({ direction: "debit", amount: "1282.05" })).toBe("-1282.05");
  });
});

describe("validateEmailAlertFields", () => {
  it("returns the validated alert when every field is well-formed", () => {
    const result = validateEmailAlertFields(validRblAlert);

    expect(result).toEqual({ valid: true, alert: validRblAlert });
  });

  it("names every invalid field at once, not just the first one", () => {
    const result = validateEmailAlertFields({
      ...validRblAlert,
      direction: "sideways",
      amount: "INR 1,282.05",
      occurredAt: "09-09-2026"
    });

    expect(result.valid).toBe(false);
    expect(result.valid === false && result.invalidFields).toEqual(["direction", "amount", "occurredAt"]);
  });

  it("keeps the LLM's own values in the draft so the owner can correct them by hand", () => {
    const result = validateEmailAlertFields({ ...validRblAlert, amount: "INR 1282.05" });

    expect(result.valid === false && result.draft).toEqual({
      ...validRblAlert,
      amount: "INR 1282.05"
    });
  });

  it("drafts a non-string field as null rather than carrying the raw value through", () => {
    const result = validateEmailAlertFields({ ...validRblAlert, amount: 1282.05 });

    expect(result.valid === false && result.draft.amount).toBeNull();
    expect(result.valid === false && result.invalidFields).toEqual(["amount"]);
  });

  it("reports a missing field as invalid with a null draft value", () => {
    const { description: _description, ...withoutDescription } = validRblAlert;

    const result = validateEmailAlertFields(withoutDescription);

    expect(result.valid === false && result.draft.description).toBeNull();
    expect(result.valid === false && result.invalidFields).toEqual(["description"]);
  });

  it("reports a payload that isn't an object at all as an empty draft", () => {
    const result = validateEmailAlertFields("not an object");

    expect(result.valid === false && result.invalidFields).toEqual(["payload"]);
    expect(result.valid === false && result.draft).toEqual({
      direction: null,
      amount: null,
      currencyCode: null,
      occurredAt: null,
      accountNumberSuffix: null,
      institutionName: null,
      description: null,
      reference: null,
      balance: null
    });
  });
});

describe("toEmailAlertDraft", () => {
  it("carries a validated alert's fields into an editable draft", () => {
    expect(toEmailAlertDraft(validateParsedEmailAlert(validRblAlert))).toEqual(validRblAlert);
  });
});

describe("validateImportableEmailAlert", () => {
  const corrected = {
    direction: "debit",
    amount: "499",
    currencyCode: "inr",
    occurredAt: "2026-09-09",
    description: "UPI/P2M/COFFEE"
  };

  it("accepts the fields an owner corrected on the Imports screen, normalizing the currency", () => {
    expect(validateImportableEmailAlert(corrected)).toEqual({
      valid: true,
      alert: { ...corrected, currencyCode: "INR" }
    });
  });

  it("names each corrected field that is still invalid so the form can flag it", () => {
    const result = validateImportableEmailAlert({
      ...corrected,
      amount: "-499",
      occurredAt: "09-09-2026",
      description: "  "
    });

    expect(result.valid === false && result.invalidFields).toEqual(["amount", "occurredAt", "description"]);
  });

  it("ignores the alert fields that never reach the ledger — an unfixable reference or balance must not block the import", () => {
    expect(validateImportableEmailAlert({ ...corrected, reference: 42, balance: "not available" }).valid).toBe(
      true
    );
  });
});
