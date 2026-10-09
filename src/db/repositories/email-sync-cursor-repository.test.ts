import { describe, expect, it } from "vitest";

import { EmailSyncCursorRepository } from "@/db/repositories/email-sync-cursor-repository";
import { createTestDb } from "@/db/repositories/test-db";

const cursor = {
  mailbox: "inbox@example.com",
  uidValidity: "1757000000",
  lastMessageUid: 120,
  updatedAt: "2026-09-09T15:02:13.000Z"
};

describe("EmailSyncCursorRepository", () => {
  it("has no pointer for a mailbox that has never been polled", async () => {
    const testDb = createTestDb();
    const repository = new EmailSyncCursorRepository(testDb.db);

    expect(await repository.get("inbox@example.com")).toBeNull();
  });

  it("stores and reads back a mailbox's pointer", async () => {
    const testDb = createTestDb();
    const repository = new EmailSyncCursorRepository(testDb.db);

    await repository.save(cursor);

    expect(await repository.get("inbox@example.com")).toEqual(cursor);
  });

  it("keeps each mailbox's pointer separate", async () => {
    const testDb = createTestDb();
    const repository = new EmailSyncCursorRepository(testDb.db);

    await repository.save(cursor);

    expect(await repository.get("other@example.com")).toBeNull();
  });

  it("overwrites the pointer as the poll advances through the mailbox", async () => {
    const testDb = createTestDb();
    const repository = new EmailSyncCursorRepository(testDb.db);
    await repository.save(cursor);

    const advanced = { ...cursor, lastMessageUid: 121, updatedAt: "2026-09-10T09:00:00.000Z" };
    await repository.save(advanced);

    expect(await repository.get("inbox@example.com")).toEqual(advanced);
  });

  it("stores a pointer for a server that reported no UIDVALIDITY", async () => {
    const testDb = createTestDb();
    const repository = new EmailSyncCursorRepository(testDb.db);

    await repository.save({ ...cursor, uidValidity: null });

    expect(await repository.get("inbox@example.com")).toEqual({ ...cursor, uidValidity: null });
  });
});
