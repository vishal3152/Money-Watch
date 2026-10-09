import { describe, expect, it } from "vitest";

import { DatabaseConstraintError } from "@/db/errors";
import { createTestDb } from "@/db/repositories/test-db";
import { UnresolvedEmailAlertRepository } from "@/db/repositories/unresolved-email-alert-repository";
import { processedEmailAlerts } from "@/db/schema";
import type { EmailAlertDraft } from "@/domain/email-alert";

const draft: EmailAlertDraft = {
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

const alert = {
  id: "alert-1",
  mailbox: "inbox@example.com",
  messageUid: "1757000000:121",
  detectedAt: "2026-09-09T15:02:13.000Z",
  failureReason: "no-match (RBL Bank …1602)",
  draft,
  invalidFields: []
};

describe("UnresolvedEmailAlertRepository", () => {
  it("lists nothing before any alert has been recorded", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);

    expect(await repository.listAll()).toEqual([]);
  });

  it("stores an alert with its draft and the fields the owner still has to fix", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);

    await repository.save({ ...alert, invalidFields: ["amount", "occurredAt"] });

    expect(await repository.listAll()).toEqual([{ ...alert, invalidFields: ["amount", "occurredAt"] }]);
  });

  it("rejects recording the same mailbox/messageUid pair twice — two overlapping polls must not both queue the same email", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await repository.save(alert);

    await expect(repository.save({ ...alert, id: "alert-2" })).rejects.toThrow(DatabaseConstraintError);
  });

  it("lists the most recently detected alert first", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await repository.save(alert);
    await repository.save({
      ...alert,
      id: "alert-2",
      messageUid: "1757000000:122",
      detectedAt: "2026-09-10T09:00:00.000Z"
    });

    expect((await repository.listAll()).map((row) => row.id)).toEqual(["alert-2", "alert-1"]);
  });

  it("reads one alert back by id", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await repository.save(alert);

    expect(await repository.getById("alert-1")).toEqual(alert);
    expect(await repository.getById("missing")).toBeNull();
  });

  it("drops a resolved alert — the ImportBatch it became is its record from then on", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await repository.save(alert);

    expect(await repository.delete("alert-1")).toBe(true);
    expect(await repository.listAll()).toEqual([]);
    expect(await repository.delete("alert-1")).toBe(false);
  });

  it("still surfaces a row recorded before drafts existed, reading its parsed alert as the draft", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await testDb.db.insert(processedEmailAlerts).values({
      id: "legacy-1",
      mailbox: "inbox@example.com",
      messageUid: "uid-legacy",
      status: "unresolved",
      processedAt: "2026-09-08T09:00:00.000Z",
      importBatchId: null,
      failureReason: "no-match (RBL Bank …1602)",
      parsedAlertJson: JSON.stringify(draft),
      alertDraftJson: null,
      invalidFieldsJson: null
    });

    expect(await repository.getById("legacy-1")).toEqual({
      id: "legacy-1",
      mailbox: "inbox@example.com",
      messageUid: "uid-legacy",
      detectedAt: "2026-09-08T09:00:00.000Z",
      failureReason: "no-match (RBL Bank …1602)",
      draft,
      invalidFields: []
    });
  });

  it("never lists a matched row recorded by an older poll — those alerts already became an ImportBatch", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await testDb.db.insert(processedEmailAlerts).values({
      id: "legacy-matched",
      mailbox: "inbox@example.com",
      messageUid: "uid-legacy-matched",
      status: "matched",
      processedAt: "2026-09-08T09:00:00.000Z",
      importBatchId: null,
      failureReason: null,
      parsedAlertJson: null,
      alertDraftJson: null,
      invalidFieldsJson: null
    });

    expect(await repository.listAll()).toEqual([]);
  });

  it("reads a corrupt stored draft as an empty one rather than breaking the whole Imports screen", async () => {
    const testDb = createTestDb();
    const repository = new UnresolvedEmailAlertRepository(testDb.db);
    await testDb.db.insert(processedEmailAlerts).values({
      id: "corrupt-1",
      mailbox: "inbox@example.com",
      messageUid: "uid-corrupt",
      status: "unresolved",
      processedAt: "2026-09-08T09:00:00.000Z",
      importBatchId: null,
      failureReason: null,
      parsedAlertJson: null,
      alertDraftJson: "{not json",
      invalidFieldsJson: "{not json"
    });

    const stored = await repository.getById("corrupt-1");

    expect(stored?.draft).toEqual({
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
    expect(stored?.invalidFields).toEqual([]);
  });
});
