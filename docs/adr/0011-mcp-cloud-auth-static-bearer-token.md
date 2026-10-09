---
status: accepted
---

# MCP statement import gets a cloud-mode path, authenticated by a static per-Owner bearer token

Amends `docs/adr/0010-import-batch-gets-a-postgres-port-for-cloud-email-sync.md`, which said "MCP
statement import itself remains out of scope for cloud... porting it isn't part of this change."
That was true when written; the owner now wants MCP statement import to work against a
cloud-hosted deployment too, not just loopback local/desktop.

`src/app/api/mcp/route.ts`'s `isLoopbackHost()` guard only makes sense for local/desktop: a real
hosted deployment has no "same machine" to trust, so any real MCP client connecting to it is a
genuine remote request. Cloud mode therefore needs its own identity check in place of the
Host-header guard, before the four MCP tools (already Postgres-capable per ADR-0010) can be
trusted with an Owner's data.

The chosen mechanism: the Owner generates a token from Settings (`/settings`, itself now
login-gated — `src/lib/supabase/session-gate.ts` no longer lists it as public, since it renders
real per-Owner data). Only the token's SHA-256 hash is persisted, one row per Owner
(`mcp_access_tokens`, `src/db/postgres/repositories/mcp-access-token-repository.ts`); the plaintext
is shown exactly once. The MCP client sends it as a static `Authorization: Bearer <token>` header —
a config shape Claude Code, Cursor, and Claude Desktop's custom-connector flow all already accept
natively, so no client-side OAuth support is required. `src/app/api/mcp/cloud-auth.ts` hashes the
presented token and resolves it to an Owner (`resolveOwnerIdByTokenHash`, a deliberate cross-owner
exception to the per-Owner-scoped repository pattern, the same shape as `listAllEmailSyncCredentials`
for email sync's cron job) — a missing or non-matching token gets a 401, same as local mode's 403
for a non-loopback Host header.

This is a narrower, different exception to CLAUDE.md's "no auth/tenancy/cloud-sync ahead of the
hosted phase" rule than `docs/adr/0008-mcp-endpoint-adds-scoped-oauth-for-remote-clients.md`
proposed (still `proposed`, unbuilt): that ADR is a generic OAuth 2.1 + dynamic-client-registration
authorization server for *any* remote MCP client, motivated specifically by ChatGPT's connector
model, which cannot use a static header. This decision only reuses the hosted tier's own Supabase
Auth session (already built, Slice 3) to gate who may *generate* a token, plus one small
credential table — it does not build a second, general-purpose auth system, and it does not make
ChatGPT's connector work. If that need arises later, ADR-0008's design still applies on top of
this, unchanged.

## Considered Options

- Reuse the Owner's live Supabase session (short-lived access token) as the MCP bearer credential
  — rejected: most MCP clients treat a configured header as static; a token that expires/rotates
  means the Owner re-pastes it into their client config periodically, worse day-2 experience than
  a stable token for no real security gain here (the loopback case it replaces also has no
  expiry).
- Implement ADR-0008's OAuth 2.1 + dynamic client registration now, instead of a static token —
  rejected as disproportionate: it's a full authorization-server subsystem (discovery endpoint,
  registration, consent screen, token endpoint) to solve a problem a static header already solves
  for every MCP client except ChatGPT, which nothing here needs yet.
- Skip auth in cloud mode and keep the Host-header guard — rejected: it does not identify *which*
  Owner is calling, and a hosted deployment's `Host` header names the app's own domain for every
  caller, so it would not restrict access at all.

## Consequences

- `/api/mcp` now has two independent gates depending on mode: `isLoopbackHost()` for local/desktop
  (unchanged), bearer-token-to-Owner resolution for cloud. Neither mode's request path exercises
  the other's guard.
- One MCP access token per Owner. Regenerating invalidates the previous token immediately — there
  is no multi-token/per-device management UI, matching CLAUDE.md's "no configurability that wasn't
  requested."
- A leaked token grants the same access an MCP client already has once configured: the four import
  tools, scoped to that one Owner's data via the existing repository-factory `ownerId` seam. Losing
  it is a Revoke-and-regenerate away, the same recovery as any other credential in this app
  (IMAP password, OpenRouter key).
