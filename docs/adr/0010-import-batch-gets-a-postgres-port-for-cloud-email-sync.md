# ImportBatch gets a Postgres port, for cloud email alert sync

Supersedes `BUILD_PLAN_CLOUD.md` Decision 4 ("ImportBatch... is out of scope for this plan... the cloud tier ships without AI-assisted import for v1"), for one reason only: email alert sync (`docs/specs/email-alert-sync.md`) needs somewhere in the cloud tier to write the Transactions it produces, and it reuses `ImportBatch` (ADR-0009) rather than a parallel entity. MCP statement import itself remains out of scope for cloud — it's a local-process integration (an AI assistant talking to a loopback MCP server) with no hosted-multi-tenant shape, and porting it isn't part of this change.

`ImportBatch` gets a full Postgres port (`import_batches` table, `transactions.import_batch_id`, `PgImportBatchRepository`) — the same port every other entity already has, following the same `getScopedDb`/app-layer-`ownerId`-filtering pattern ADR-0006 established. `/imports` and `/imports/[id]` drop their `isCloudMode()` redirect guard.

Email alert sync's cloud trigger is a Vercel Cron job (`vercel.json` `crons`, `CRON_SECRET`-authenticated) calling a Node-runtime API route once per configured Owner, instead of the local-tier's standalone poll process (`docs/specs/email-alert-sync.md`) — Vercel serverless has no long-running process to hold an interval. Per-Owner IMAP/OpenRouter credentials live in a new `email_sync_settings` Postgres table (owner-scoped, app-layer filtered like every other cloud table), a deliberate, explicitly owner-approved exception to this app's local-first default of storing such secrets only in the owner's own `settings.json` — see that spec's "Cloud credentials" note for the trade-off accepted (no RLS second line of defense against an `ownerId`-filter bug, per ADR-0006).

## Considered Options

- Leave ImportBatch local-only and give email alert sync a different, cloud-only entity shape. Rejected — defeats the point of reusing ImportBatch (ADR-0009's whole justification), and would mean building and maintaining two parallel review UIs.
- Store cloud email-sync credentials as Vercel project environment variables instead of a per-Owner table. Rejected for the actual cloud tier as built: it's multi-tenant (`PRODUCT.md`), and env vars can't hold a different mailbox/API key per Owner. Would only work for a single-owner cloud deployment, which isn't what this tier is.
