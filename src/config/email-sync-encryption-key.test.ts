import { afterEach, describe, expect, it } from "vitest";

import { resolveEmailSyncEncryptionKey } from "@/config/email-sync-encryption-key";

const ORIGINAL_ENV = process.env.EMAIL_SYNC_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.EMAIL_SYNC_ENCRYPTION_KEY;
  } else {
    process.env.EMAIL_SYNC_ENCRYPTION_KEY = ORIGINAL_ENV;
  }
});

describe("resolveEmailSyncEncryptionKey", () => {
  it("throws when EMAIL_SYNC_ENCRYPTION_KEY is unset", () => {
    delete process.env.EMAIL_SYNC_ENCRYPTION_KEY;

    expect(() => resolveEmailSyncEncryptionKey()).toThrow(/EMAIL_SYNC_ENCRYPTION_KEY/);
  });

  it("throws when the key doesn't decode to 32 bytes", () => {
    process.env.EMAIL_SYNC_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");

    expect(() => resolveEmailSyncEncryptionKey()).toThrow(/32 bytes/);
  });

  it("returns the decoded 32-byte key when set correctly", () => {
    const key = Buffer.alloc(32, 7);
    process.env.EMAIL_SYNC_ENCRYPTION_KEY = key.toString("base64");

    expect(resolveEmailSyncEncryptionKey()).toEqual(key);
  });
});
