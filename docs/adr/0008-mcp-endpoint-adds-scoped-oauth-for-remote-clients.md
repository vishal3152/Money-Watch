---
status: proposed
---

# MCP import server adds a scoped OAuth-protected public endpoint, ahead of the general hosted phase

`docs/specs/import.md` originally specified the MCP import server as loopback-only, mounted on the local Next.js server and not reachable off the local machine — matching this project's local-first design principle of not building auth, tenancy, or cloud-sync ahead of the hosted phase. Cursor and GitHub Copilot can connect to a loopback MCP endpoint directly. ChatGPT's connector model cannot: it requires a publicly routable HTTPS endpoint protected by OAuth 2.1 with dynamic client registration. The owner wants all three clients able to upload transactions, so the loopback-only constraint is amended: the same four MCP tools (`list_institutions`, `list_accounts`, `stage_import`, `commit_import`) are additionally exposed over a public, OAuth-protected HTTP endpoint, alongside — not instead of — the existing loopback endpoint.

This is a narrow, single-purpose exception to CLAUDE.md's "no auth/tenancy/cloud-sync ahead of the hosted phase" rule: it authenticates requests to this one endpoint only. It is not a general auth system, not multi-tenancy, and not the hosted Postgres/Supabase tier — there is still exactly one Owner per dataset, so the OAuth token answers "is this the app owner's assistant," not "which owner."

## Considered Options

- Loopback only, wait for the hosted phase — rejected: the owner explicitly wants ChatGPT support now, not deferred.
- Pull the full hosted multi-tenant phase (Supabase Auth, `src/lib/supabase`, `Pg*Repository`) forward to authenticate this endpoint — rejected: far larger scope than requested; would mean shipping the cloud tier's login/session/tenancy work to satisfy one MCP connector.
- A single-purpose OAuth guard scoped to just this endpoint, independent of the hosted tier's eventual auth — accepted.

## Consequences

- New scope, tracked as its own follow-up work rather than folded into the MCP-tools TDD slice: public hosting/TLS reachability for this one endpoint, an OAuth 2.1 token issuance/validation flow, and a security pass over it (rate limiting, scope-limited tokens, revocation).
- Local/self-hosted deployments are unaffected by default: the loopback endpoint still needs no auth. The public endpoint is additive and opt-in.
- If/when the general hosted multi-tenant phase begins, this endpoint's single-owner token model needs revisiting against real per-owner identity.
