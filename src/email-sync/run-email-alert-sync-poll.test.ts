import { describe, expect, it, vi } from "vitest";

import { AccountRepository } from "@/db/repositories/account-repository";
import { EmailSyncCursorRepository } from "@/db/repositories/email-sync-cursor-repository";
import { InstitutionRepository } from "@/db/repositories/institution-repository";
import { createTestDb } from "@/db/repositories/test-db";
import { TransactionRepository } from "@/db/repositories/transaction-repository";
import { UnresolvedEmailAlertRepository } from "@/db/repositories/unresolved-email-alert-repository";
import { runEmailAlertSyncPoll, type RunEmailAlertSyncPollDeps } from "@/email-sync/run-email-alert-sync-poll";

function deps(
  testDb: ReturnType<typeof createTestDb>,
  overrides: Partial<RunEmailAlertSyncPollDeps> & Pick<RunEmailAlertSyncPollDeps, "fetchUnseenMessages" | "callLlm">
    // classifyIsTransactionUpdate defaults to always-true below, matching the existing pattern for
    // optional test-fixture fields — most tests don't care about the classifier gate.
): RunEmailAlertSyncPollDeps {
  return {
    getCurrentOwnerId: async () => null,
    isCloudMode: () => false,
    db: testDb.db,
    mailbox: "owner@example.com",
    classifyIsTransactionUpdate: async () => true,
    ...overrides
  };
}

async function seedAccounts(testDb: ReturnType<typeof createTestDb>) {
  await new InstitutionRepository(testDb.db).create({ id: "inst-rbl", name: "RBL Bank" });
  await new AccountRepository(testDb.db).create({
    id: "acc-rbl",
    institutionId: "inst-rbl",
    name: "Savings",
    accountNumber: "XXXX1602",
    currencyCode: "INR"
  });
}

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

const unmatchedAlert = { ...validRblAlert, accountNumberSuffix: "9999", institutionName: "Unknown Bank" };

describe("runEmailAlertSyncPoll", () => {
  it("imports a resolvable alert without storing an alert row — the ImportBatch is its record", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:1", subject: "Credit Alert", body: "..." }]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 1, unresolved: 0, ignored: 0, skipped: 0 });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-rbl")).toHaveLength(1);
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toEqual([]);
  });

  it("moves the mailbox's pointer past every message it has read", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([
      { uid: "100:7", subject: "Credit Alert", body: "..." },
      { uid: "100:9", subject: "Credit Alert", body: "..." }
    ]);

    await runEmailAlertSyncPoll(
      deps(testDb, { fetchUnseenMessages, callLlm, now: () => "2026-09-09T15:02:13.000Z" })
    );

    expect(await new EmailSyncCursorRepository(testDb.db).get("owner@example.com")).toEqual({
      mailbox: "owner@example.com",
      uidValidity: "100",
      lastMessageUid: 9,
      updatedAt: "2026-09-09T15:02:13.000Z"
    });
  });

  it("never re-reads a message at or below the pointer, so no LLM call is paid for twice", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    await new EmailSyncCursorRepository(testDb.db).save({
      mailbox: "owner@example.com",
      uidValidity: "100",
      lastMessageUid: 5,
      updatedAt: "2026-09-08T00:00:00.000Z"
    });
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([
      { uid: "100:5", subject: "Already read", body: "..." },
      { uid: "100:6", subject: "Credit Alert", body: "..." }
    ]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 1, unresolved: 0, ignored: 0, skipped: 1 });
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("re-reads the mailbox from scratch when its UIDVALIDITY changed — uids restarted, so the old pointer says nothing about these messages", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    await new EmailSyncCursorRepository(testDb.db).save({
      mailbox: "owner@example.com",
      uidValidity: "100",
      lastMessageUid: 500,
      updatedAt: "2026-09-08T00:00:00.000Z"
    });
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "200:1", subject: "Credit Alert", body: "..." }]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 1, unresolved: 0, ignored: 0, skipped: 0 });
  });

  it("stores nothing for mail the sender/subject classifier says isn't a bank alert — that is what keeps the queue the size of the owner's real backlog", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn();
    const classifyIsTransactionUpdate = vi.fn().mockResolvedValue(false);
    const fetchUnseenMessages = vi
      .fn()
      .mockResolvedValue([{ uid: "100:1", subject: "Your bill payment of Rs 499 is due", body: "..." }]);

    const result = await runEmailAlertSyncPoll(
      deps(testDb, { fetchUnseenMessages, callLlm, classifyIsTransactionUpdate })
    );

    expect(result).toEqual({ matched: 0, unresolved: 0, ignored: 1, skipped: 0 });
    expect(callLlm).not.toHaveBeenCalled();
    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toEqual([]);
    expect((await new EmailSyncCursorRepository(testDb.db).get("owner@example.com"))?.lastMessageUid).toBe(1);
  });

  it("queues a bank alert whose fields failed validation as unresolved, keeping the LLM's values for the owner to correct", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue({ ...validRblAlert, amount: "INR 1,282.05", occurredAt: "09-09-2026" });
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:1", subject: "Credit Alert", body: "..." }]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 0, unresolved: 1, ignored: 0, skipped: 0 });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-rbl")).toEqual([]);
    const [alert] = await new UnresolvedEmailAlertRepository(testDb.db).listAll();
    expect(alert?.invalidFields).toEqual(["amount", "occurredAt"]);
    expect(alert?.failureReason).toBe("invalid-fields");
    expect(alert?.draft.amount).toBe("INR 1,282.05");
    expect(alert?.draft.description).toBe(validRblAlert.description);
  });

  it("queues an alert whose claimed date is implausibly far from when the email arrived, flagging that one field", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue({ ...validRblAlert, occurredAt: "2019-01-01" });
    const fetchUnseenMessages = vi
      .fn()
      .mockResolvedValue([{ uid: "100:1", subject: "Credit Alert", body: "...", receivedAt: "2026-09-09T15:02:13.000Z" }]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 0, unresolved: 1, ignored: 0, skipped: 0 });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-rbl")).toEqual([]);
    const [alert] = await new UnresolvedEmailAlertRepository(testDb.db).listAll();
    expect(alert?.invalidFields).toEqual(["occurredAt"]);
    expect(alert?.failureReason).toBe("implausible-occurredAt");
    expect(alert?.draft.occurredAt).toBe("2019-01-01");
  });

  it("queues an alert no single Account matches, with no field to fix — only the Account is missing", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(unmatchedAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:3", subject: "Credit Alert", body: "..." }]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 0, unresolved: 1, ignored: 0, skipped: 0 });
    const [alert] = await new UnresolvedEmailAlertRepository(testDb.db).listAll();
    expect(alert?.invalidFields).toEqual([]);
    expect(alert?.failureReason).toBe("no-match (Unknown Bank …9999)");
    expect(alert?.draft).toEqual(unmatchedAlert);
  });

  it("queues an amount the resolved Account's currency can't represent as unresolved (without aborting the poll) rather than dropping it", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    await new InstitutionRepository(testDb.db).create({ id: "inst-jpy", name: "Sumitomo" });
    await new AccountRepository(testDb.db).create({
      id: "acc-jpy",
      institutionId: "inst-jpy",
      name: "Yen Savings",
      accountNumber: "XXXX7777",
      currencyCode: "JPY"
    });
    const jpyAlertWithFraction = {
      ...validRblAlert,
      currencyCode: "JPY",
      accountNumberSuffix: "7777",
      institutionName: "Sumitomo"
    };
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(jpyAlertWithFraction) // uid 1 — bad precision for JPY
      .mockResolvedValueOnce(validRblAlert); // uid 2 — must still be processed normally
    const fetchUnseenMessages = vi.fn().mockResolvedValue([
      { uid: "100:1", subject: "Credit Alert", body: "..." },
      { uid: "100:2", subject: "Credit Alert", body: "..." }
    ]);

    const result = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(result).toEqual({ matched: 1, unresolved: 1, ignored: 0, skipped: 0 });
    const [alert] = await new UnresolvedEmailAlertRepository(testDb.db).listAll();
    expect(alert?.invalidFields).toEqual(["amount"]);
    expect(alert?.failureReason).toBe("minorUnits");
  });

  it("leaves the pointer at the last message it finished when a later message blows up the poll, so the failed one is retried and the finished ones are not", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(validRblAlert)
      .mockRejectedValueOnce(new Error("LLM host unreachable"));
    const fetchUnseenMessages = vi.fn().mockResolvedValue([
      { uid: "100:1", subject: "Credit Alert", body: "..." },
      { uid: "100:2", subject: "Credit Alert", body: "..." }
    ]);

    await expect(runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }))).rejects.toThrow(
      "LLM host unreachable"
    );

    expect((await new EmailSyncCursorRepository(testDb.db).get("owner@example.com"))?.lastMessageUid).toBe(1);
  });

  it("reuses a deterministic ImportBatch id so a retry after a crash does not double-write", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:9", subject: "Credit", body: "..." }]);
    await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    // Simulate a crash before the pointer moved: the ImportBatch/Transaction exist, the poll reads
    // the same message again.
    await new EmailSyncCursorRepository(testDb.db).save({
      mailbox: "owner@example.com",
      uidValidity: "100",
      lastMessageUid: 8,
      updatedAt: "2026-09-08T00:00:00.000Z"
    });

    const second = await runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm }));

    expect(second).toEqual({ matched: 1, unresolved: 0, ignored: 0, skipped: 0 });
    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-rbl")).toHaveLength(1);
  });

  it("two concurrent polls racing on the same message (overlapping cron/daemon invocations) do not crash — only one ImportBatch is created", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(validRblAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:1", subject: "Credit Alert", body: "..." }]);

    // Both calls read the same pointer before either advances it — the same overlap two cron
    // invocations (or a restarted daemon plus its predecessor) can hit against a real mailbox.
    const results = await Promise.allSettled([
      runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm, newId: () => "poll-a" })),
      runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm, newId: () => "poll-b" }))
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
      if (result.status === "fulfilled") {
        expect(result.value.matched + result.value.skipped).toBe(1);
      }
    }

    expect(await new TransactionRepository(testDb.db).listByAccountId("acc-rbl")).toHaveLength(1);
  });

  it("two concurrent polls racing on the same unmatched message queue it once, not twice", async () => {
    const testDb = createTestDb();
    await seedAccounts(testDb);
    const callLlm = vi.fn().mockResolvedValue(unmatchedAlert);
    const fetchUnseenMessages = vi.fn().mockResolvedValue([{ uid: "100:1", subject: "Credit Alert", body: "..." }]);

    const results = await Promise.allSettled([
      runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm, newId: () => "poll-a" })),
      runEmailAlertSyncPoll(deps(testDb, { fetchUnseenMessages, callLlm, newId: () => "poll-b" }))
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
      if (result.status === "fulfilled") {
        expect(result.value.unresolved + result.value.skipped).toBe(1);
      }
    }

    expect(await new UnresolvedEmailAlertRepository(testDb.db).listAll()).toHaveLength(1);
  });
});
