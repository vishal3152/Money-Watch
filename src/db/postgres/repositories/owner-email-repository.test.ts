import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { upsertOwnerEmail } from "@/db/postgres/repositories/owner-email-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

async function readEmail(ownerId: string): Promise<string | null> {
  const rows = await admin`select email from owner_emails where id = ${ownerId}`;
  return rows[0]?.email ?? null;
}

describe("upsertOwnerEmail", () => {
  it("inserts a mapping for an Owner with no existing row", async () => {
    const ownerId = randomUUID();

    await upsertOwnerEmail(CONNECTION_STRING, ownerId, "owner@example.com");

    expect(await readEmail(ownerId)).toBe("owner@example.com");
  });

  it("upserts: a second call for the same Owner replaces the stored email", async () => {
    const ownerId = randomUUID();

    await upsertOwnerEmail(CONNECTION_STRING, ownerId, "old@example.com");
    await upsertOwnerEmail(CONNECTION_STRING, ownerId, "new@example.com");

    expect(await readEmail(ownerId)).toBe("new@example.com");
  });

  it("does not affect another Owner's stored email", async () => {
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();

    await upsertOwnerEmail(CONNECTION_STRING, ownerId, "owner@example.com");
    await upsertOwnerEmail(CONNECTION_STRING, otherOwnerId, "other@example.com");

    expect(await readEmail(ownerId)).toBe("owner@example.com");
    expect(await readEmail(otherOwnerId)).toBe("other@example.com");
  });
});
