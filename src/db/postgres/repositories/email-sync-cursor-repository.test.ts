import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { PgEmailSyncCursorRepository } from "@/db/postgres/repositories/email-sync-cursor-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

const cursor = {
  mailbox: "inbox@example.com",
  uidValidity: "1757000000",
  lastMessageUid: 120,
  updatedAt: "2026-09-09T15:02:13.000Z"
};

describe("PgEmailSyncCursorRepository", () => {
  it("has no pointer for a mailbox that has never been polled", async () => {
    const repository = new PgEmailSyncCursorRepository(CONNECTION_STRING, randomUUID());

    expect(await repository.get("inbox@example.com")).toBeNull();
  });

  it("stores and reads back a mailbox's pointer", async () => {
    const repository = new PgEmailSyncCursorRepository(CONNECTION_STRING, randomUUID());

    await repository.save(cursor);

    expect(await repository.get("inbox@example.com")).toEqual(cursor);
  });

  it("overwrites the pointer as the poll advances through the mailbox", async () => {
    const repository = new PgEmailSyncCursorRepository(CONNECTION_STRING, randomUUID());
    await repository.save(cursor);

    const advanced = { ...cursor, lastMessageUid: 121, updatedAt: "2026-09-10T09:00:00.000Z" };
    await repository.save(advanced);

    expect(await repository.get("inbox@example.com")).toEqual(advanced);
  });

  it("never returns another Owner's pointer for the same mailbox address", async () => {
    const owner = new PgEmailSyncCursorRepository(CONNECTION_STRING, randomUUID());
    const otherOwner = new PgEmailSyncCursorRepository(CONNECTION_STRING, randomUUID());
    await owner.save(cursor);

    expect(await otherOwner.get(cursor.mailbox)).toBeNull();
  });
});
