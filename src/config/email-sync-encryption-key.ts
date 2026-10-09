const KEY_LENGTH_BYTES = 32;

/**
 * Symmetric key for `src/domain/secret-cipher.ts`, used by `PgEmailSyncSettingsRepository` to
 * encrypt/decrypt IMAP credentials at rest. Base64-encoded 32 bytes (AES-256) — generate one with
 * `openssl rand -base64 32`. Mirrors `resolvePostgresConnectionString()`'s read-from-env pattern.
 */
export function resolveEmailSyncEncryptionKey(): Buffer {
  const raw = process.env.EMAIL_SYNC_ENCRYPTION_KEY;
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(
      "EMAIL_SYNC_ENCRYPTION_KEY is not set — required to store/read email sync IMAP credentials. " +
        "Generate one with `openssl rand -base64 32`."
    );
  }

  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `EMAIL_SYNC_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes (AES-256), got ${key.length}. ` +
        "Generate one with `openssl rand -base64 32`."
    );
  }

  return key;
}
