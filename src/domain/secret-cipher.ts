import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for a secret at rest (IMAP credentials, `PgEmailSyncSettingsRepository`).
 * The key is injected, never read here — `src/config/email-sync-encryption-key.ts` resolves it.
 * Envelope: `v1:` + base64(iv[12] | authTag[16] | ciphertext). The `v1:` prefix lets `decryptSecret`
 * tell a value it wrote from a pre-existing plaintext value (see `decryptSecret`) without guessing.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENVELOPE_PREFIX = "v1:";

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ENVELOPE_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * A value that doesn't start with `v1:` is passed through unchanged rather than rejected — it
 * predates this encryption (a row written before this change) and self-heals on the next
 * `PgEmailSyncSettingsRepository.set()`, which always re-encrypts.
 */
export function decryptSecret(value: string, key: Buffer): string {
  if (!value.startsWith(ENVELOPE_PREFIX)) {
    return value;
  }

  const raw = Buffer.from(value.slice(ENVELOPE_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
