import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  listAllEmailSyncCredentials,
  PgEmailSyncSettingsRepository,
  recordEmailSyncPollAttempt
} from "@/db/postgres/repositories/email-sync-settings-repository";

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const admin = postgres(CONNECTION_STRING, { max: 1 });

// Fixed, not random: rows persist in the shared local Postgres across test runs (this suite never
// truncates the table), so the key must stay stable across runs the same way a real deployment's
// EMAIL_SYNC_ENCRYPTION_KEY does — a per-run random key would strand previous runs' rows undecryptable.
const ORIGINAL_ENCRYPTION_KEY = process.env.EMAIL_SYNC_ENCRYPTION_KEY;
process.env.EMAIL_SYNC_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString("base64");

afterAll(async () => {
  await admin.end();
  if (ORIGINAL_ENCRYPTION_KEY === undefined) {
    delete process.env.EMAIL_SYNC_ENCRYPTION_KEY;
  } else {
    process.env.EMAIL_SYNC_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  }
});

const credentials = {
  imapHost: "imap.example.com",
  imapPort: 993,
  imapUser: "owner@example.com",
  imapPassword: "app-password",
  llmBaseUrl: "https://openrouter.ai/api/v1",
  llmApiKey: "sk-or-123",
  llmModel: "openai/gpt-4o-mini",
  pollIntervalMinutes: 5
};

describe("PgEmailSyncSettingsRepository", () => {
  it("returns null before any settings are saved", async () => {
    const ownerId = randomUUID();
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    expect(await repository.get()).toBeNull();
  });

  it("saves and reads back settings, scoped to the Owner", async () => {
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    await repository.set(credentials);

    expect(await repository.get()).toEqual({ ownerId, ...credentials });
    expect(await new PgEmailSyncSettingsRepository(CONNECTION_STRING, otherOwnerId).get()).toBeNull();
  });

  it("set() upserts: a second call replaces the first", async () => {
    const ownerId = randomUUID();
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    await repository.set(credentials);
    await repository.set({ ...credentials, imapHost: "imap2.example.com" });

    expect((await repository.get())?.imapHost).toBe("imap2.example.com");
  });

  it("stores imapUser/imapPassword encrypted at rest, not as plaintext", async () => {
    const ownerId = randomUUID();
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    await repository.set(credentials);

    const [row] = await admin`select imap_user, imap_password from email_sync_settings where owner_id = ${ownerId}`;

    expect(row.imap_user).not.toBe(credentials.imapUser);
    expect(row.imap_password).not.toBe(credentials.imapPassword);
    expect(row.imap_user).toMatch(/^v1:/);
    expect(row.imap_password).toMatch(/^v1:/);
  });

  it("returns a legacy plaintext row unchanged when it predates encryption", async () => {
    const ownerId = randomUUID();
    await admin`
      insert into email_sync_settings (owner_id, imap_host, imap_port, imap_user, imap_password, llm_base_url, llm_api_key, llm_model, poll_interval_minutes)
      values (${ownerId}, ${credentials.imapHost}, ${credentials.imapPort}, ${credentials.imapUser}, ${credentials.imapPassword}, ${credentials.llmBaseUrl}, ${credentials.llmApiKey}, ${credentials.llmModel}, ${credentials.pollIntervalMinutes})
    `;
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    expect(await repository.get()).toEqual({ ownerId, ...credentials });
  });

  it("returns llmApiKey as undefined when the column is null (a self-hosted host that needs no auth)", async () => {
    const ownerId = randomUUID();
    await admin`
      insert into email_sync_settings (owner_id, imap_host, imap_port, imap_user, imap_password, llm_base_url, llm_api_key, llm_model, poll_interval_minutes)
      values (${ownerId}, ${credentials.imapHost}, ${credentials.imapPort}, ${credentials.imapUser}, ${credentials.imapPassword}, ${"http://localhost:11434/v1"}, ${null}, ${"llama3.1"}, ${credentials.pollIntervalMinutes})
    `;
    const repository = new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId);

    expect((await repository.get())?.llmApiKey).toBeUndefined();
  });
});

describe("listAllEmailSyncCredentials", () => {
  it("returns every Owner's saved credentials, not scoped to one Owner", async () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerA).set(credentials);
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerB).set({
      ...credentials,
      imapHost: "imap-b.example.com"
    });

    const all = await listAllEmailSyncCredentials(CONNECTION_STRING);
    const ownerIds = all.map((row) => row.ownerId);

    expect(ownerIds).toEqual(expect.arrayContaining([ownerA, ownerB]));
    for (const row of all) {
      if (row.ownerId === ownerA || row.ownerId === ownerB) {
        expect(row.ok).toBe(true);
      }
    }
  });

  it("isolates one Owner's undecryptable row: returns { ok: false } for it, not a thrown error that would drop every other Owner", async () => {
    const badOwnerId = randomUUID();
    const goodOwnerId = randomUUID();
    // A row not in the "v1:"-prefixed encrypted envelope, but also not valid plaintext for the
    // current key expectations — inserted directly so rowToCredentials's decrypt call throws.
    await admin`
      insert into email_sync_settings (owner_id, imap_host, imap_port, imap_user, imap_password, llm_base_url, llm_api_key, llm_model, poll_interval_minutes)
      values (${badOwnerId}, ${credentials.imapHost}, ${credentials.imapPort}, ${"v1:not-valid-ciphertext"}, ${credentials.imapPassword}, ${credentials.llmBaseUrl}, ${credentials.llmApiKey}, ${credentials.llmModel}, ${credentials.pollIntervalMinutes})
    `;
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, goodOwnerId).set(credentials);

    const all = await listAllEmailSyncCredentials(CONNECTION_STRING);
    const badRow = all.find((row) => row.ownerId === badOwnerId);
    const goodRow = all.find((row) => row.ownerId === goodOwnerId);

    expect(badRow?.ok).toBe(false);
    expect(goodRow?.ok).toBe(true);
  });

  it("orders by lastPolledAt ascending with never-polled Owners first", async () => {
    const olderOwnerId = randomUUID();
    const neverPolledOwnerId = randomUUID();
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, olderOwnerId).set(credentials);
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, neverPolledOwnerId).set(credentials);
    await recordEmailSyncPollAttempt(CONNECTION_STRING, olderOwnerId, "2026-09-09T00:00:00.000Z");

    const all = await listAllEmailSyncCredentials(CONNECTION_STRING);
    const olderIndex = all.findIndex((row) => row.ownerId === olderOwnerId);
    const neverPolledIndex = all.findIndex((row) => row.ownerId === neverPolledOwnerId);

    expect(neverPolledIndex).toBeLessThan(olderIndex);
  });
});

describe("recordEmailSyncPollAttempt", () => {
  it("updates lastPolledAt for the given Owner only", async () => {
    const ownerId = randomUUID();
    const otherOwnerId = randomUUID();
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, ownerId).set(credentials);
    await new PgEmailSyncSettingsRepository(CONNECTION_STRING, otherOwnerId).set(credentials);

    await recordEmailSyncPollAttempt(CONNECTION_STRING, ownerId, "2026-09-09T12:00:00.000Z");

    const [row] = await admin`select last_polled_at from email_sync_settings where owner_id = ${ownerId}`;
    const [otherRow] = await admin`select last_polled_at from email_sync_settings where owner_id = ${otherOwnerId}`;
    expect(row.last_polled_at).toBe("2026-09-09T12:00:00.000Z");
    expect(otherRow.last_polled_at).toBeNull();
  });
});
