---
status: accepted
---

# Cloud-tier IMAP credentials are encrypted at rest with an app-layer symmetric key

`docs/specs/email-alert-sync.md`'s "Cloud credentials" note previously accepted that per-Owner IMAP
host/port/username/password and the OpenRouter API key sit in `email_sync_settings` "protected only
by app-layer `ownerId` filtering" — a deliberate, owner-approved trade-off given the local-first
default is secrets-only-in-`settings.json`. The owner has now asked for the IMAP username/password
specifically to be encrypted at rest, decrypted only server-side, on demand.

The chosen mechanism: AES-256-GCM (`src/domain/secret-cipher.ts`, `encryptSecret`/`decryptSecret`),
keyed by a single symmetric key from the `EMAIL_SYNC_ENCRYPTION_KEY` env var
(`src/config/email-sync-encryption-key.ts`, mirroring `resolvePostgresConnectionString()`'s
read-from-env pattern) — never derived from anything stored in the same database. `imap_user`/
`imap_password` stay `text` columns (no migration): `PgEmailSyncSettingsRepository.set()` encrypts
before writing, `get()`/`listAllEmailSyncCredentials()` decrypt transparently, so every existing
caller (`saveEmailSyncSettings`, the cron route) keeps working against the same plaintext
`EmailSyncCredentials` shape. Encryption/decryption only ever happens in this Node-side repository —
there is no client code path to these values, and `getEmailSyncSettingsSummary()`'s
`hasImapPassword` boolean already never exposes the value itself.

The envelope is prefixed (`v1:` + base64(iv|authTag|ciphertext)); a stored value without that prefix
is treated as legacy plaintext and returned as-is rather than rejected, self-healing on the row's
next `set()`. This matters in practice, not just in theory: `listAllEmailSyncCredentials` reads every
Owner's row unconditionally for the cron job, so a hard failure on one un-migrated row would break
every Owner's poll in that invocation.

`openRouterApiKey` is intentionally left as plaintext — the owner scoped this change to the IMAP
credentials specifically.

## Considered Options

- Encrypt with a key derived from something in the same Postgres database (e.g. a per-Owner value) —
  rejected: an attacker with read access to the database would then have everything needed to
  decrypt every row, which defeats the point of encrypting at rest at all. The key must live outside
  the data it protects.
- A managed KMS (e.g. cloud provider key management, envelope encryption with key rotation) —
  rejected for now as disproportionate to this app's current single-key, single-environment-variable
  deployment shape (Vercel + one Supabase Postgres); revisit if/when a real key-rotation or
  multi-region requirement appears.
- Hash instead of encrypt, the way `mcp_access_tokens` stores only a SHA-256 hash
  (`docs/adr/0011-mcp-cloud-auth-static-bearer-token.md`) — rejected: an MCP token is presented back
  by the caller and only ever needs to be *compared*, so a one-way hash suffices. An IMAP password
  must be recovered in full to authenticate to the mailbox, so it needs reversible encryption, not
  hashing.
- New dedicated columns (e.g. `imap_user_encrypted`) instead of encrypting in place — rejected:
  no schema change is needed since the columns are already `text`, and a second column pair would
  need its own migration and a backfill/cutover step for no behavioral benefit.

## Consequences

- Cloud mode now requires `EMAIL_SYNC_ENCRYPTION_KEY` to be set (a random base64-encoded 32 bytes,
  e.g. `openssl rand -base64 32`) before any Owner can save or the cron job can read email sync
  settings; `resolveEmailSyncEncryptionKey()` throws a clear, actionable error otherwise rather than
  silently storing plaintext or crashing obscurely.
- Losing the key makes every already-stored IMAP credential unrecoverable (the Owner must re-enter
  them) — the same recovery path as any other credential in this app going stale, but worth stating
  since there is deliberately no fallback/recovery key.
- `email_sync_settings.openrouter_api_key` remains plaintext, protected only by the existing
  app-layer `ownerId` filtering (ADR-0006) — a materially different, and lesser, protection than the
  IMAP columns now have. Extending this scheme to it is a future decision if asked for, not implied
  by this change.
