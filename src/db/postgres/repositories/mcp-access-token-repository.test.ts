import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  PgMcpAccessTokenRepository,
  resolveOwnerIdByTokenHash
} from "@/db/postgres/repositories/mcp-access-token-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

afterAll(async () => {
  await admin.end();
});

describe("PgMcpAccessTokenRepository", () => {
  it("returns null before any token is saved", async () => {
    const ownerId = randomUUID();
    const repository = new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerId);

    expect(await repository.get()).toBeNull();
  });

  it("saves and reads back a token summary, scoped to the Owner", async () => {
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const repository = new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerId);

    await repository.set(randomUUID(), "2026-09-11T00:00:00.000Z");

    expect(await repository.get()).toEqual({ ownerId, createdAt: "2026-09-11T00:00:00.000Z" });
    expect(await new PgMcpAccessTokenRepository(CONNECTION_STRING, otherOwnerId).get()).toBeNull();
  });

  it("set() upserts: regenerating replaces the previous hash", async () => {
    const ownerId = randomUUID();
    const repository = new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerId);
    const firstHash = randomUUID();
    const secondHash = randomUUID();

    await repository.set(firstHash, "2026-09-11T00:00:00.000Z");
    await repository.set(secondHash, "2026-09-11T01:00:00.000Z");

    expect(await repository.get()).toEqual({ ownerId, createdAt: "2026-09-11T01:00:00.000Z" });
    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, firstHash)).toBeNull();
    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, secondHash)).toBe(ownerId);
  });

  it("revoke() deletes the token; a subsequent get() returns null", async () => {
    const ownerId = randomUUID();
    const repository = new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerId);
    const tokenHash = randomUUID();
    await repository.set(tokenHash, "2026-09-11T00:00:00.000Z");

    await repository.revoke();

    expect(await repository.get()).toBeNull();
    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, tokenHash)).toBeNull();
  });

  it("revoke() on an Owner with no token is a no-op", async () => {
    const repository = new PgMcpAccessTokenRepository(CONNECTION_STRING, randomUUID());

    await expect(repository.revoke()).resolves.toBeUndefined();
  });
});

describe("resolveOwnerIdByTokenHash", () => {
  it("resolves the Owner that a token hash belongs to, across every Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const hashA = randomUUID();
    const hashB = randomUUID();
    await new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerA).set(hashA, "2026-09-11T00:00:00.000Z");
    await new PgMcpAccessTokenRepository(CONNECTION_STRING, ownerB).set(hashB, "2026-09-11T00:00:00.000Z");

    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, hashA)).toBe(ownerA);
    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, hashB)).toBe(ownerB);
  });

  it("returns null for a hash that matches no stored token", async () => {
    expect(await resolveOwnerIdByTokenHash(CONNECTION_STRING, randomUUID())).toBeNull();
  });
});
