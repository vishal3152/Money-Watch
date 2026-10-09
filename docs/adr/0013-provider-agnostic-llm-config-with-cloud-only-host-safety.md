---
status: accepted
---

# Email alert sync's LLM call is provider-agnostic, with a cloud-only host-safety guard

ADR-0009 established that Paisa-Watch itself calls an LLM server-side for email alert sync, via
OpenRouter, using an owner-supplied API key. The call itself was hardcoded to OpenRouter's endpoint
and OpenAI-compatible `response_format: json_schema` structured-output mode. The owner asked for
this to become provider-agnostic: any host that speaks the same OpenAI-compatible
chat-completions API — OpenRouter, OpenAI itself, or a self-hosted Ollama server — configurable by
base URL and API key in Settings, specifically so a privacy-conscious owner can keep alert emails
off third-party servers entirely by running Ollama locally.

## Decision

`src/email-sync/openrouter-client.ts` is replaced by `src/email-sync/llm-client.ts`
(`createLlmCaller`), taking `{ baseUrl, apiKey?, model, enforceHostSafety, fetchImpl? }` instead of
`{ apiKey, model? }`. `baseUrl` is the **full chat-completions endpoint URL** as entered in Settings
(e.g. `https://openrouter.ai/api/v1/chat/completions` or
`http://localhost:11434/v1/chat/completions` for Ollama) — used as-is (only a trailing slash is
stripped); the client does not append `/chat/completions`. `apiKey` is optional: when blank, the
`Authorization` header is omitted entirely rather than sent as an empty bearer token, since a
self-hosted host typically needs no auth at all. `model` has no universal default once the host is
configurable (OpenRouter's model IDs have no meaning to Ollama, which needs the exact name of a
model the owner has already pulled locally), so it becomes a required setting instead of the
previous hardcoded `openai/gpt-4o-mini` default (still pre-filled as a convenience in the settings
form).

Corresponding storage changes: `EmailSyncSettings`/`EmailSyncCredentials`' `openRouterApiKey`
field is replaced by `llmBaseUrl` (required), `llmApiKey` (optional), `llmModel` (required) on both
tiers — `src/config/email-sync-settings.ts` (local `settings.json`) and `email_sync_settings`
(Postgres, `postgres/migrations/20260912020000_email_sync_llm_provider.sql`, which backfills
`llm_base_url`/`llm_api_key`/`llm_model` from the existing OpenRouter configuration before dropping
`openrouter_api_key`, so an already-configured Owner's sync keeps working unchanged rather than
silently breaking on deploy). `llm_api_key` stays plaintext at rest, same as `openrouter_api_key`
before it — out of ADR-0012's scope, which was deliberately limited to the IMAP columns.

### Cloud-only host-safety check (the one deliberate divergence from the IMAP precedent)

The IMAP host SSRF guard (`src/domain/imap-host-safety.ts`'s `assertSafeImapHostname`, resolved at
connect time by `src/email-sync/assert-safe-imap-host.ts`) blocks localhost/private/link-local/
metadata hosts **unconditionally, on both tiers** — `email-sync-actions.ts` calls it the same way
regardless of `isCloudMode()`. A new LLM host check (`src/domain/llm-host-safety.ts`'s
`assertSafeLlmBaseUrl`, resolved by `src/email-sync/assert-safe-llm-host.ts`'s
`assertSafeLlmBaseUrlResolved`, reusing the IMAP module's `isBlockedIpAddress`/`BLOCKED_HOSTNAMES`)
covers the same set of targets, but is applied **only in cloud mode**:

- In cloud mode, this call runs server-side on shared Vercel infra for every configured Owner. A
  localhost/private-IP `llmBaseUrl` there is a real SSRF vector (e.g. pointing at
  `169.254.169.254` or an internal service) — `saveEmailSyncSettings` runs the sync check at
  save time when `isCloudMode()`, and `createLlmCaller`'s cloud call sites (`check-now/route.ts`'s
  cloud branch, `cron/route.ts`) pass `enforceHostSafety: true`, running the resolved check
  immediately before the first fetch of each poll pass (see "cached per poll" below).
- In local/self-hosted mode, this check never runs (`saveEmailSyncSettings` skips it when
  `!isCloudMode()`; `start-polling.ts` and `check-now/route.ts`'s local branch pass
  `enforceHostSafety: false`). This is a single-owner machine already trusted with every other
  local secret, and the entire point of a configurable LLM host is letting the owner reach their
  own machine's Ollama server on `localhost` — the same check IMAP uses would block exactly the
  use case this feature exists for.

`llm-host-safety.ts`'s sync check is itself split in two: `assertValidLlmBaseUrl` (non-empty,
parseable, http/https scheme) runs unconditionally on **both** tiers at save time — a garbage value
like `"not a url"` must fail immediately in the settings form, not silently save and only surface as
a confusing failure at the next poll — while `assertSafeLlmBaseUrl` (adds the blocked-hostname/
literal-IP check) layers on top of it and stays cloud-mode only, as above.

`createLlmCaller` caches the resolved check's outcome (a `Promise<void>` closed over per caller
instance) rather than re-running it on every `callLlm` invocation: one poll pass calls `callLlm`
once per fetched message, and re-resolving DNS for every message in a large backlog would eat into
the cron route's tight `POLL_BUDGET_MS` window for no benefit — the resolved address cannot change
in any way that matters mid-poll. A fresh caller (and so a fresh check) is constructed once per
Owner per invocation (`cron/route.ts`'s per-Owner loop) or once per on-demand/scheduled check
(`check-now/route.ts`, `start-polling.ts`'s per-tick caller), which is the right granularity.

`createLlmCaller` posts to `baseUrl` exactly as configured (trailing slash stripped only). Settings
stores and displays this as the full endpoint URL so OpenAI/OpenRouter doc pastes and Ollama's
OpenAI-compatible path (`/v1/chat/completions`) both work without the client guessing path suffixes.

This is a genuine, deliberate inconsistency with the IMAP guard's tier-blind behavior, made
knowingly rather than by omission: the two settings have opposite risk profiles for the "local
host" case, since nobody runs their own IMAP server on their laptop, but running an LLM inference
server on localhost is the entire ask.

`assertSafeLlmBaseUrlResolved` does not pin the outbound `fetch` call to its resolved address the
way `assertSafeImapHostResolved` pins `ImapFlow`'s connection (via `servername`/a pre-resolved
address) — `fetch`/undici has no equivalent connect-time override without a custom dispatcher. A
narrow DNS-rebinding TOCTOU window therefore remains between the resolved check and the fetch call
itself in cloud mode. Closing it fully was judged disproportionate to this feature's risk relative
to the engineering cost; the hostname-shape and literal-IP checks (covering the common case: a
configured value that is itself `localhost`/a private IP/a blocked metadata hostname) and the
resolved-DNS check (covering a public-looking hostname that resolves to a blocked address) both
still run.

### Bug fixed in the same change

`createLlmCaller`'s predecessor (`createOpenRouterCaller`) let `JSON.parse(content)` — and the
"response has no message content" case — throw uncaught (a bare `SyntaxError`/generic `Error`),
which `run-email-alert-sync-poll.ts` does not catch (only `InvalidEmailAlertError` is caught
per-message; anything else aborts the whole poll). This was always a latent risk, but becomes much
more likely once a provider that doesn't strictly honor the OpenAI `response_format: json_schema`
mode is in scope — Ollama's OpenAI-compatible layer currently ignores it outright. Both failure
modes now raise `InvalidEmailAlertError`, so a non-compliant provider's malformed response is
recorded `invalid` for that one message (the existing, already-specified outcome for a response
that fails validation) instead of crashing the rest of that poll pass.

## Considered Options

- Same SSRF policy as IMAP (block on both tiers) — rejected: would block the exact use case the
  owner asked for (a local Ollama server), making the feature pointless for its stated motivation.
- No SSRF check on the LLM host at all — rejected: leaves a genuine SSRF hole on the cloud
  multi-tenant deployment, where any signed-in Owner could point `llmBaseUrl` at Vercel's internal
  network.
- Full DNS-rebinding-proof pinning for the LLM fetch (matching IMAP's `servername`/pre-resolved-
  address connect), via a custom `fetch` dispatcher — rejected for now as disproportionate
  engineering effort for the residual risk it closes; revisit if this ever needs to defend a higher-
  value target than "read a bank alert email."
- Backward-compatible code-level fallback reading the old `openRouterApiKey`/`openrouter_api_key`
  field when the new fields are unset — rejected: the owner explicitly chose a clean rename with no
  ongoing compatibility-shim code (this repo has exactly one Owner today). The Postgres migration
  still backfills the new columns from the old one as a one-time SQL data migration (not an
  application-code fallback) so the migration itself doesn't break an existing configured row.

## Consequences

- An owner using a local Ollama server for email alert sync in cloud mode cannot — `llmBaseUrl`
  must resolve to a public address there. This is inherent to the feature (a Vercel serverless
  function cannot reach an arbitrary owner's home network regardless of any SSRF policy), not an
  artifact of the guard.
- `llm-client.ts` is now unit-tested (`llm-client.test.ts`, via an injectable `fetchImpl`), breaking
  the "thin I/O plumbing, deliberately untested" convention its OpenRouter-specific predecessor
  followed — justified because this version now contains real branching logic (URL joining,
  optional auth, the error-wrapping fix above) worth verifying without a real network call.
