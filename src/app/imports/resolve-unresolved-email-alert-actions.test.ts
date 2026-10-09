import { describe, expect, it, vi } from "vitest";

import {
  resolveUnresolvedEmailAlertAction,
  type ResolveUnresolvedEmailAlertState
} from "@/app/imports/resolve-unresolved-email-alert-actions";
import { AccountRepository } from "@/db/repositories/account-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { UnresolvedEmailAlertRepository } from "@/db/repositories/unresolved-email-alert-repository";
import type { EmailAlertDraft } from "@/domain/email-alert";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";

const rblCreditDraft: EmailAlertDraft = {
  direction: "credit",
  amount: "1282.05",
  currencyCode: "INR",
  occurredAt: "2026-09-09",
  accountNumberSuffix: "1602",
  institutionName: "RBL Bank",
  description: "NEFT credit",
  reference: "NEFT/1",
  balance: "468531.58"
};

async function seed(testDb: ReturnType<typeof createTestDb>, draft: EmailAlertDraft = rblCreditDraft) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-1", name: "RBL Bank" });
  await new AccountRepository(testDb.db).create({
    id: "acc-1",
    institutionId: "inst-1",
    name: "Savings",
    accountNumber: "XXXX1602",
    currencyCode: "INR"
  });
  await new UnresolvedEmailAlertRepository(testDb.db).save({
    id: "alert-1",
    mailbox: "inbox@example.com",
    messageUid: "uid-9",
    detectedAt: "2026-09-09T11:00:00.000Z",
    failureReason: "no-match (RBL Bank …1602)",
    draft,
    invalidFields: []
  });
}

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function submission(overrides: Record<string, string> = {}): FormData {
  return formData({
    alertId: "alert-1",
    accountId: "acc-1",
    direction: "credit",
    amount: "1282.05",
    currencyCode: "INR",
    occurredAt: "2026-09-09",
    description: "NEFT credit",
    ...overrides
  });
}

function deps(testDb: ReturnType<typeof createTestDb>, redirectTo: (path: string) => void) {
  return { db: testDb.db, redirectTo, getCurrentOwnerId: async () => null, isCloudMode: () => false };
}

describe("resolveUnresolvedEmailAlertAction", () => {
  it("imports the alert onto the chosen Account and redirects to the new ImportBatch", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission(),
      deps(testDb, redirectTo)
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalledWith(expect.stringMatching(/^\/imports\//));
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toEqual([]);
  });

  it("imports the owner's corrected values for an alert the LLM got wrong", async () => {
    const testDb = createTestDb();
    await seed(testDb, { ...rblCreditDraft, amount: "INR 1,282.05", direction: null });
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ direction: "debit", amount: "499.50", description: "UPI/P2M/COFFEE" }),
      deps(testDb, redirectTo)
    );

    expect(result).toEqual({});
    expect(redirectTo).toHaveBeenCalled();
  });

  it("flags each field the owner still has to fix, without touching the queue", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ amount: "INR 1,282.05", occurredAt: "09-09-2026" }),
      deps(testDb, redirectTo)
    );

    expect(result.fieldErrors?.amount).toBeDefined();
    expect(result.fieldErrors?.occurredAt).toBeDefined();
    expect(result.fieldErrors?.description).toBeUndefined();
    expect(redirectTo).not.toHaveBeenCalled();
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toHaveLength(1);
  });

  it("keeps what the owner typed when validation fails, so a correction is never retyped", async () => {
    const testDb = createTestDb();
    await seed(testDb);

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ amount: "oops", description: "UPI/P2M/COFFEE" }),
      deps(testDb, vi.fn())
    );

    expect(result.values?.description).toBe("UPI/P2M/COFFEE");
    expect(result.values?.amount).toBe("oops");
    expect(result.formKey).toBeDefined();
  });

  it("asks for an Account when none was chosen", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ accountId: "" }),
      deps(testDb, redirectTo)
    );

    expect(result.fieldErrors?.accountId).toEqual({ key: "errors.alertAccountRequired" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("rejects a description longer than the shared free-text limit", async () => {
    const testDb = createTestDb();
    await seed(testDb);

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ description: "a".repeat(TEXT_FIELD_MAX_LENGTH + 1) }),
      deps(testDb, vi.fn())
    );

    expect(result.fieldErrors?.description).toEqual({
      key: "errors.textTooLong",
      params: { max: TEXT_FIELD_MAX_LENGTH }
    });
  });

  it("reports a currency that doesn't match the chosen Account against the currency field", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    await new AccountRepository(testDb.db).create({
      id: "acc-usd",
      institutionId: "inst-1",
      name: "USD",
      accountNumber: "XXXX9999",
      currencyCode: "USD"
    });
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ accountId: "acc-usd" }),
      deps(testDb, redirectTo)
    );

    expect(result.fieldErrors?.currencyCode).toEqual({ key: "errors.alertCurrencyMismatch" });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("reports an amount the Account's currency can't represent against the amount field", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    await new InstitutionRepository(testDb.db).create({ id: "inst-jpy", name: "Sumitomo" });
    await new AccountRepository(testDb.db).create({
      id: "acc-jpy",
      institutionId: "inst-jpy",
      name: "Yen",
      accountNumber: "XXXX7777",
      currencyCode: "JPY"
    });

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ accountId: "acc-jpy", currencyCode: "JPY" }),
      deps(testDb, vi.fn())
    );

    expect(result.fieldErrors?.amount).toEqual({ key: "errors.alertMinorUnits" });
  });

  it("returns a friendly form error when the alert is no longer in the queue", async () => {
    const testDb = createTestDb();
    await seed(testDb);
    const redirectTo = vi.fn();

    const result = await resolveUnresolvedEmailAlertAction(
      {} as ResolveUnresolvedEmailAlertState,
      submission({ alertId: "missing" }),
      deps(testDb, redirectTo)
    );

    expect(result.formError).toEqual({ key: "errors.alertGone" });
    expect(redirectTo).not.toHaveBeenCalled();
  });
});
