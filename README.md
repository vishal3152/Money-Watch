<div align="center">

<img src="public/brand/logo-lockup.svg" alt="Money Watch" width="320" />

# Money Watch <sub><sup>(`paisa-watch`)</sup></sub>

**A personal system of record for money held across multiple institutions and currencies — built to _verify_ balances, not just display them.**

[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node 22 LTS](https://img.shields.io/badge/Node-22%20LTS-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Supabase](https://img.shields.io/badge/Supabase-cloud-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Electron](https://img.shields.io/badge/Electron-desktop-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![MCP](https://img.shields.io/badge/MCP-server-D97757)](https://modelcontextprotocol.io)

[Desktop app](#option-a--desktop-app-electron) · [Run it locally](#option-b--run-from-source-local-mode) · [Self-host the cloud mode](#option-c--cloud-mode-supabase) · [Architecture](#architecture) · [FAQ](#faq)

</div>

---

## Why this exists

Every budgeting app in existence starts from the same assumption: **the number your bank shows you is the truth.** It downloads that number, categorises it, draws a pie chart, and calls the job done.

If you hold money at several institutions, in several currencies, that assumption quietly fails. A wire arrives with a different FX rate than quoted. A fee lands that nobody told you about. A fixed deposit matures into the wrong account. The bank's number is still "correct" — it just no longer matches what *should* be there, and nothing in your tooling is designed to notice.

**Money Watch is built the other way around.** You keep your own ledger. Periodically you capture what the bank *claims* your balance is, and the app formally compares it against what your ledger computes. The difference is a first-class record — a `Discrepancy` — that you must explicitly resolve as *corrected-my-record*, *disputed-with-bank*, or leave open. Corrections are never silent edits to history; they are `Adjustment` records, visibly distinct from real bank activity.

That's the whole thesis: **independent verification over trust.**

> **Not** a budgeting app, **not** an expense tracker, and **not** a bank aggregator. There is no Plaid/Yodlee-style credential-sharing integration anywhere in this codebase, by design.

---

## Table of contents

- [Feature overview](#feature-overview)
- [Two ways to run it](#two-ways-to-run-it)
- [Privacy and data ownership](#privacy-and-data-ownership)
- [Getting started](#getting-started)
  - [Option A — Desktop app (Electron)](#option-a--desktop-app-electron)
  - [Option B — Run from source (local mode)](#option-b--run-from-source-local-mode)
  - [Option C — Cloud mode (Supabase)](#option-c--cloud-mode-supabase)
  - [Option D — Cloud mode without Supabase (email/password auth)](#option-d--cloud-mode-without-supabase-emailpassword-auth)
- [Environment variables](#environment-variables)
- [Why Supabase, and when you actually need it](#why-supabase-and-when-you-actually-need-it)
- [AI features (opt-in)](#ai-features-opt-in)
- [Architecture](#architecture)
- [Development workflow](#development-workflow)
- [Building and releasing](#building-and-releasing)
- [Project status and known gaps](#project-status-and-known-gaps)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Feature overview

| Area | What it does |
| --- | --- |
| **Institutions & Accounts** | Track any number of banks and accounts, each denominated in a single currency (USD, SGD, INR, AED — anything). Delete is dependency-guarded so ledger history can never be silently cascaded away. |
| **Transactions** | A full ledger per account. Every transaction carries a trust status — `Confirmed` (you entered or reviewed it) or `Imported` (came from an automated feed, not yet reviewed). |
| **Transfers** | A transfer between two accounts is **one entity with two legs**, not two disconnected transactions. Cross-currency transfers carry the **FX rate actually realised** — not an assumed market rate — so a bad rate is itself a signal. ([ADR-0001](docs/adr/0001-transfer-as-single-entity-with-realized-fx-rate.md)) |
| **Fixed Deposits** | Term deposits with principal, rate, maturity date and a linked funding/payout account. Lifecycle: `Open` → `Matured` / `PrematurelyClosed`. Funding and withdrawal happen only through Transfers, never through arbitrary transactions. |
| **Reconciliation** | Capture a `BalanceSnapshot` (what the bank says) and run a `Reconciliation` against the computed ledger balance. Any mismatch becomes a `Discrepancy` that must be resolved explicitly — as an `Adjustment`, as a dispute, or left open. |
| **Share trading** | `ShareTradingAccount` + `StockTransaction` (Buy/Sell by scrip code), with per-company `Holdings` computed from the trade history. Deliberately standalone — no cash-leg bookkeeping, no cost basis, no valuation. |
| **AI-assisted import** | A built-in **MCP server**: point Claude Desktop / Claude Code / Cursor at the app and ask it to import a bank statement. The assistant parses the PDF/CSV; the app only receives structured rows, staged into an `ImportBatch` you review, confirm, or undo as a unit. |
| **Email alert sync** | Optionally poll an IMAP mailbox for bank debit/credit alert emails and turn them into reviewable `ImportBatch` rows automatically. Works with **any** OpenAI-compatible LLM host — including a local Ollama server, so alerts never leave your machine. |
| **Multi-currency by construction** | Every amount is stored and computed as **integer minor units** (paise/cents). No floats touch money anywhere in the codebase. |
| **Mobile-first UI** | Server Components + Server Actions, no client-side state library, no REST layer. Designed touch-first and verified at narrow viewports. |
| **Languages** | English, Simplified Chinese (中文) and Arabic (العربية), switchable in Settings. Arabic renders right-to-left. Amounts stay in each Account's own currency and Latin digits — money formatting is deliberately not locale-dependent. |

---

## Two ways to run it

The same codebase, the same screens, and the same Server Actions run in **two peer deployment modes**. Only the data-access driver and whether authentication is enforced differ.

<table>
<tr><th></th><th>🖥️ Local / self-hosted mode</th><th>☁️ Cloud mode</th></tr>
<tr><td><b>Database</b></td><td>SQLite file on your disk (<code>better-sqlite3</code>)</td><td>Supabase Postgres</td></tr>
<tr><td><b>Auth</b></td><td>None — there is no login screen at all</td><td>Supabase Auth (email/password with self-service password reset, + Google sign-in) by default, or static per-email accounts with <code>AUTH_PROVIDER=simple</code> (<a href="#option-d--cloud-mode-without-supabase-emailpassword-auth">Option D</a>)</td></tr>
<tr><td><b>Owners per install</b></td><td>Exactly one</td><td>Many, each fully isolated</td></tr>
<tr><td><b>How you run it</b></td><td>Desktop app (Electron), <code>next dev</code>/<code>next start</code> in a browser, or Docker/NAS</td><td>Vercel (or any Node host) + a Supabase project</td></tr>
<tr><td><b>Where secrets live</b></td><td><code>~/.config/paisa-watch/settings.json</code> on your own machine</td><td>Postgres, with IMAP credentials encrypted at rest (AES-256-GCM)</td></tr>
<tr><td><b>MCP statement import</b></td><td>✅ Loopback-only, no credential needed</td><td>✅ Bearer token (hashed at rest, shown once)</td></tr>
<tr><td><b>Email alert sync</b></td><td>✅ Standalone poll process (<code>pnpm email-sync:poll</code>)</td><td>✅ Vercel Cron job, daily</td></tr>
<tr><td><b>Network calls made by the app</b></td><td>None, unless you configure email sync</td><td>Supabase; plus your LLM/IMAP host if email sync is on</td></tr>
</table>

**The Electron desktop app is always local.** It forces `DEPLOYMENT_MODE=local`, has no storage-mode switch, and never even loads the Supabase SDK — cloud modules are behind dynamic imports gated on `isCloudMode()`, so the desktop process never constructs a Supabase client. ([ADR-0007](docs/adr/0007-electron-desktop-is-local-only.md))

---

## Privacy and data ownership

This project takes a specific position: **your financial ledger is yours, and the default posture is that nothing leaves your machine.**

### In local / self-hosted mode

- **Your data is a single SQLite file.** You choose where it lives (`DATABASE_PATH`, or the in-app Settings screen). Point it at a Dropbox/iCloud/Syncthing folder and you have sync and versioned backups for free. Back it up by copying one file.
- **No account, no login, no server.** There is no sign-up flow to opt out of, because there is nothing to sign up to.
- **No telemetry, no analytics, no crash reporting, no phone-home.** The app makes no outbound network requests at all unless *you* configure email alert sync.
- **No bank credentials, ever.** Money Watch never asks for online-banking logins and has no screen-scraping or aggregator integration. It reads statements you already have and alert emails your bank already sent you.
- **The MCP import endpoint is loopback-only.** Requests whose `Host` header isn't loopback are rejected with 403 — on the desktop/self-hosted tier, "same machine" *is* the trust boundary.
- **Statement files never touch the app.** With MCP import, your AI assistant reads the PDF/CSV itself and sends the app structured rows. Money Watch never sees the file.

### In cloud mode

- **One dataset, one Owner, no sharing.** There is no household/shared-access feature; Owners are isolated from each other by design.
- **Every query filters by `owner_id` in the repository layer**, and every repository method has a dedicated cross-owner isolation test — each one was verified by deliberately breaking the filter and watching the test go red before being trusted. Row-Level Security policies remain defined in the migrations but are deliberately dormant; the honest reasoning (and its cost trade-off, ~250ms × 6 round trips per call) is written up in [ADR-0006](docs/adr/0006-drop-rls-for-app-layer-owner-filtering.md), which supersedes [ADR-0005](docs/adr/0005-cloud-tier-owner-isolation-via-rls.md).
- **IMAP credentials are encrypted at rest** with AES-256-GCM, keyed by `EMAIL_SYNC_ENCRYPTION_KEY` — an env var that deliberately lives *outside* the database it protects. Decryption happens server-side only; there is no client code path to those values. ([ADR-0012](docs/adr/0012-imap-credentials-encrypted-at-rest-with-app-layer-key.md))
- **Secrets are never echoed back to the browser.** Once saved, the settings form shows "Leave blank to keep the saved value" — never the value.
- **MCP access tokens are stored as SHA-256 hashes**, displayed exactly once at generation. ([ADR-0011](docs/adr/0011-mcp-cloud-auth-static-bearer-token.md))
- **SSRF guards on user-supplied hosts.** IMAP hostnames are blocked from resolving to localhost/private/link-local/metadata addresses on *both* tiers; the LLM base URL gets the same guard in cloud mode only — precisely so a local install can point at `http://localhost:11434` for Ollama. ([ADR-0013](docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-safety.md))
- **Cloud credentials never get baked into the desktop build.** The Electron packaging script stashes every `.env*` file out of the tree before building and asserts none made it into the packaged app.

### The AI boundary, stated plainly

| Feature | Who calls an LLM | What it sees |
| --- | --- | --- |
| MCP statement import | **Your** assistant, with **your** subscription | The statement file you gave it. The app never receives the file — only structured rows. |
| Email alert sync | **The app itself**, server-side | The text of bank alert emails it fetched, sent to the host **you** configured. |

Email alert sync is the one place the app makes an LLM call on your behalf — a deliberate, narrow exception documented in [ADR-0009](docs/adr/0009-email-alert-sync-calls-llm-server-side.md), because there is no human present at fetch time. It is **off by default**, and because the host is configurable ([ADR-0013](docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-safety.md)) you can point it at a local Ollama server and keep alert emails off third-party infrastructure entirely.

---

## Getting started

### Option A — Desktop app (Electron)

This repo does not publish installers. Build the desktop app yourself with [`pnpm electron:package`](#building-and-releasing) after the [clone and install](#option-b--run-from-source-local-mode) steps below.

On macOS that produces `Paisa-Watch-<version>-arm64.dmg` and a matching `.zip` in `dist/electron/`. The app bundles its own Next.js server and SQLite. On first launch it creates and migrates its database at `~/Library/Application Support/Paisa-Watch/paisa-watch.db`, then opens a window. You can move that file anywhere from **Settings**.

> **macOS Gatekeeper:** builds are currently **ad-hoc signed but not notarised** (no Apple Developer ID), so macOS blocks the first launch of a downloaded copy with "Apple could not verify…". Click **Done**, then open **System Settings → Privacy & Security** and click **Open Anyway** next to Money Watch — or run `xattr -dr com.apple.quarantine "/Applications/Money Watch.app"`.

> **Windows / Linux:** `pnpm electron:package` (and `pnpm release`) also produce a Windows installer (`Paisa-Watch Setup <version>.exe`, NSIS, x64) on macOS and Linux hosts, and a Linux package (`Paisa-Watch-<version>.AppImage`) on a Linux host — see [Building and releasing](#building-and-releasing). Option B runs from source on every platform.

### Option B — Run from source (local mode)

**Zero cloud services. Zero accounts. One SQLite file.**

**Prerequisites:** [Node.js 22 LTS](https://nodejs.org) and [pnpm](https://pnpm.io/installation).

```bash
git clone https://github.com/vishal3152/Money-Watch.git
cd Money-Watch
pnpm install
```

Then pick how you want to run it:

```bash
# 1. In a browser, local SQLite mode (self-hosted / Docker / NAS style)
pnpm exec next dev
# → http://localhost:3000

# 2. As the desktop app, from source
pnpm electron:dev
# spawns its own Next.js server on 127.0.0.1:4571 and opens a window
```

That's the entire setup. **No `.env` file is required for local mode** — the database is created and migrated automatically on first use at `./paisa-watch.db`. Override it any time:

```bash
DATABASE_PATH=~/Dropbox/money/paisa-watch.db pnpm exec next dev
```

…or set the path in the app's **Settings** screen, which persists it to `~/.config/paisa-watch/settings.json`.

> ⚠️ **Heads-up on `pnpm dev`:** the `dev` and `start` scripts in `package.json` are wired for **cloud** mode (they run the Postgres migration step and set `DEPLOYMENT_MODE=cloud`), so they expect Supabase to be reachable. For local SQLite mode in a browser, use `pnpm exec next dev` / `pnpm exec next start` as shown above, or `pnpm electron:dev` for the desktop shell.

**Want data to look at?** A deterministic demo fixture (10 institutions, 100 accounts across INR/USD/AED, 100 fixed deposits, 600 transactions, 600 transfers) ships in the repo:

```bash
pnpm exec next dev          # start the app
open http://localhost:3000/dev/seed   # then click "Load seed data"
```

The seeder refuses to run if any seed institution already exists, and is disabled in production builds. See [`scripts/demo-data/README.md`](scripts/demo-data/README.md).

### Option C — Cloud mode (Supabase)

Cloud mode swaps the SQLite driver for Supabase Postgres and turns on Supabase Auth. Same screens, same Server Actions.

#### C1. Local cloud development (against a local Supabase stack)

Requires **Docker** and the Supabase CLI (already a dev dependency).

```bash
pnpm supabase:start     # boots the local Supabase stack + applies postgres/migrations
```

Create `.env.local` (copy [`env.example`](env.example)):

```bash
DEPLOYMENT_MODE=cloud
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key printed by `supabase start`>
POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Then:

```bash
pnpm dev                # applies pending migrations, then starts Next in cloud mode
pnpm supabase:stop      # when you're done
```

Migrations are applied automatically by `scripts/prepare-cloud-database.ts` before `pnpm dev` / `pnpm start` — pointing `POSTGRES_URL` at a brand-new Postgres creates every table for you, with no manual CLI push. Versions are tracked in `supabase_migrations.schema_migrations`, so a database previously pushed with the Supabase CLI stays compatible.

#### C2. Deploying cloud mode (Supabase + Vercel)

1. **Create a Supabase project.** Copy the project URL and publishable (anon) key from **Project Settings → API**.
2. **Enable the auth providers you want** under **Authentication → Providers** — email/password works out of the box; add Google if you want the Google sign-in button to function. Set the redirect URL to `https://<your-domain>/auth/callback`.
3. **Grab the Postgres connection string.** Prefer the **Session pooler URI (port 5432)** — not the direct `db.*` host and not the transaction pooler on 6543.
4. **Set the environment variables** in Vercel → **Project → Settings → Environment Variables** ([full table below](#environment-variables)):
   `DEPLOYMENT_MODE=cloud`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `POSTGRES_URL`, plus `EMAIL_SYNC_ENCRYPTION_KEY` and `CRON_SECRET` if you want email alert sync.
5. **Deploy** — `vercel deploy --prod`, or `pnpm release` to run the whole tests → typecheck → Electron package → GitHub Release → Vercel pipeline.
6. **Schema migrations apply on boot**, so the first deploy provisions every table.

`vercel.json` already declares the daily email-sync cron job; see [`docs/cron-setup.md`](docs/cron-setup.md) for the full walkthrough (including why the schedule is daily — Vercel's Hobby plan rejects anything finer).

> **Not on Vercel?** Nothing in the app is Vercel-specific except the cron trigger. Any Node 22 host works: set the env vars, `pnpm build`, `pnpm start`. You'll need your own scheduler hitting `/api/cron/email-sync` with the `Authorization: Bearer $CRON_SECRET` header.

### Option D — Cloud mode without Supabase (email/password auth)

If you just want Postgres-backed cloud mode without a Supabase project or Docker, set `AUTH_PROVIDER=simple` instead of going through Option C. There's no sign-up and no users table — you configure a static list of `email:password` accounts in `AUTH_USERS`, and each email is its own fully isolated Owner: signing in as one email never shows another email's data ([ADR-0015](docs/adr/0015-simple-email-password-auth-as-supabase-alternative.md)).

```bash
DEPLOYMENT_MODE=cloud
AUTH_PROVIDER=simple
AUTH_USERS=owner1@example.com:pass1,owner2@example.com:pass2
POSTGRES_URL=<any Postgres connection string>   # still the data layer — see below
```

`POSTGRES_URL` is the app's Postgres connection either way (Drizzle against standard Postgres — any Postgres works, including a plain Docker container or a managed Postgres host). You don't need a Supabase project, publishable key, or OAuth config for this path — those only exist for `AUTH_PROVIDER=supabase` (the default). Everything else (deploy target, migrations-on-boot, `pnpm build && pnpm start`) is identical to Option C's C2. There's no password reset flow — edit `AUTH_USERS` and redeploy to add, remove, or rotate an account (removing an email also revokes any session already signed in under it).

---

## Environment variables

Copy [`env.example`](env.example) to `.env.local` (gitignored) and fill in only what your mode needs.

| Variable | Required when | Default | What it does |
| --- | --- | --- | --- |
| `DEPLOYMENT_MODE` | Cloud mode | `local` | `local` → SQLite, no auth. `cloud` → Postgres + Auth (backend picked by `AUTH_PROVIDER`). Forced to `local` under Electron; implied `cloud` on Vercel (`VERCEL=1`). |
| `DATABASE_PATH` | Never (optional) | `./paisa-watch.db` in a browser; `appData/Paisa-Watch/paisa-watch.db` on desktop | Where the SQLite file lives. Point it at a synced folder for free backup/sync. Also settable from the in-app Settings screen. |
| `AUTH_PROVIDER` | Never (optional) | `supabase` | Cloud mode's auth backend. `supabase` (default, Option C) → email/password + Google via Supabase Auth. `simple` (Option D) → static `AUTH_USERS` accounts, no external provider. |
| `NEXT_PUBLIC_SUPABASE_URL` | Cloud mode with `AUTH_PROVIDER=supabase` | — | Supabase project URL (**Project Settings → API**). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cloud mode with `AUTH_PROVIDER=supabase` | — | Supabase publishable/anon key. Safe to expose to the browser. |
| `AUTH_USERS` | Cloud mode with `AUTH_PROVIDER=simple` | — | Comma-separated `email:password` accounts (e.g. `a@x.com:pass1,b@y.com:pass2`). Each email is its own isolated Owner. No reset flow — edit and redeploy to add, remove, or rotate one. |
| `POSTGRES_URL` | Cloud mode | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (local stack) | Postgres connection used for migrations and all server-side data access — any Postgres, not only Supabase's. Prefer the **Session pooler URI (port 5432)** on Supabase. |
| `EMAIL_SYNC_ENCRYPTION_KEY` | Cloud mode, once any Owner turns on email sync | — | Base64-encoded 32 bytes (AES-256) encrypting IMAP credentials at rest. Generate with `openssl rand -base64 32`. **Losing it makes every saved IMAP credential unrecoverable — back it up like any other secret.** |
| `CRON_SECRET` | Cloud mode, for scheduled email sync | — | Shared secret Vercel Cron sends back as a bearer token to `/api/cron/email-sync`. Must be ≥32 chars; `openssl rand -hex 32`. Shorter values are rejected by the route. |

Per-Owner IMAP host/port/username/password, LLM base URL/model/API key and the poll interval are **not** environment variables — they're configured in the app's **Settings → Email Alert Sync** screen (stored in `~/.config/paisa-watch/settings.json` locally, or the Owner's Postgres row in cloud mode).

---

## Why Supabase, and when you actually need it

Short version: **you do not need Supabase to run this app.** It is a dependency of *cloud mode only*.

Supabase does two jobs in cloud mode, and nothing anywhere else:

1. **Postgres** — the multi-Owner database, replacing the local SQLite file.
2. **Auth** — email/password and Google sign-in, which is what gives each Owner an `owner_id` for the repository layer to scope every query by.

`@supabase/supabase-js` and `@supabase/ssr` appear in `dependencies` because they ship in the same package as the cloud build, but in local mode **they are never imported**: middleware, owner lookup, header chrome, `/login` and `/auth/callback` all load the Supabase SDK through dynamic `import()` behind `isCloudMode()`. A desktop/self-hosted process never constructs a Supabase client, never needs Auth env vars, and never pays for session plumbing it can't use ([ADR-0007](docs/adr/0007-electron-desktop-is-local-only.md)).

The `supabase` CLI in `devDependencies` exists purely so contributors can run `pnpm supabase:start` and execute the Postgres-backed test suite locally against Docker.

**Could you swap Supabase for plain Postgres?** The data layer, yes — it's Drizzle against standard Postgres, and `POSTGRES_URL` accepts any Postgres connection string. For Auth, `AUTH_PROVIDER=simple` (Option D) now does exactly that: static `email:password` accounts, no external provider, in exchange for no sign-up flow and no password reset ([ADR-0015](docs/adr/0015-simple-email-password-auth-as-supabase-alternative.md)).

---

## AI features (opt-in)

### 1. Statement import over MCP

The app exposes its own **Model Context Protocol** server at `/api/mcp`, so an AI assistant can import a bank statement conversationally:

> "Here's my October HDFC statement PDF — import it into Money Watch."

The assistant parses the file and calls these tools:

`list_institutions` · `create_institution` · `list_accounts` · `create_account` · `resolve_account` · `stage_import` · `commit_import`
`list_share_trading_accounts` · `create_share_trading_account` · `resolve_share_trading_account` · `stage_stock_import` · `commit_stock_import`

Everything lands as `Imported` transactions inside an `ImportBatch` that you review at `/imports` and then **confirm or undo as a single unit** — including undoing a batch *after* confirmation, provided no later reconciliation or Adjustment depends on it. If a closing balance was captured, confirming the batch also produces a `BalanceSnapshot` and runs a `Reconciliation` in the same step.

Connect your client in about a minute: **Settings → Connect AI Assistant** shows the exact URL and a ready-to-paste `mcp.json`. Full walkthrough (Claude Desktop, Claude Code, Cursor, troubleshooting): [`docs/mcp-setup.md`](docs/mcp-setup.md). Spec: [`docs/specs/import.md`](docs/specs/import.md).

### 2. Email alert sync

Most banks send a debit/credit alert email within seconds of a transaction. Point Money Watch at that mailbox over IMAP and those alerts become reviewable `ImportBatch` rows on their own — no forwarding, no pasting.

- Configure IMAP host/port/username/**app password** (Gmail requires an App Password when 2-Step Verification is on — the Settings screen links to Google's doc), plus an LLM base URL, model, and optional API key.
- A sender/subject classifier pre-filters candidates so the LLM only sees mail that plausibly *is* a transaction alert; Gmail's Promotions and Social categories are excluded outright.
- The LLM structures each alert; account resolution back to one of your Accounts is **deterministic**, not model-guessed.
- **Local:** run the poll process with `pnpm email-sync:poll`. **Cloud:** a Vercel Cron job runs it daily per Owner.
- **Privacy escape hatch:** set the base URL to `http://localhost:11434/v1/chat/completions` and the model to whatever you've pulled in Ollama, and no email content leaves your machine.

Spec: [`docs/specs/email-alert-sync.md`](docs/specs/email-alert-sync.md) · [ADR-0009](docs/adr/0009-email-alert-sync-calls-llm-server-side.md) · [ADR-0013](docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-safety.md)

---

## Architecture

### Layout

```
src/
├─ app/              Next.js App Router — routes, Server Components, Server Actions
│  ├─ api/mcp/       MCP server (statement + stock-trade import tools)
│  ├─ api/cron/      Cloud email-sync cron entry point
│  ├─ settings/      DB path, email sync config, MCP token management
│  └─ login/         Cloud-only auth screens (dynamic-imported, absent in local mode)
├─ domain/           Pure domain logic — reconciliation, FX, holdings, discrepancy resolution.
│                    No database, no framework. Fully unit-testable.
├─ db/
│  ├─ schema.ts      Drizzle schema — SQLite tier
│  ├─ repositories/  SQLite repository implementations
│  ├─ postgres/      Parallel Postgres schema + repositories for the cloud tier
│  └─ repository-factory.ts   The tier-selection seam
├─ email-sync/       IMAP fetch, classifier, LLM client, host-safety guards
├─ i18n/             en/zh/ar message catalogs + translator (cookie-selected locale)
├─ desktop/          Electron bootstrap helpers (DB path, app URL, migrate-on-start)
└─ config/           Deployment mode, DB path resolution, settings.json, env parsing

electron/main.cjs    Desktop shell — hosts a BrowserWindow only
drizzle/             Generated SQLite migrations (never hand-edited)
postgres/migrations/ Cloud-tier SQL migrations
docs/                CODEMAP, specs, ADRs, setup guides
```

### The three seams that made cloud mode a driver swap, not a rewrite

This project was built local-first, but three decisions were made *ahead of need* — and only three:

1. **Drizzle ORM, not a SQLite-only driver** — the same schema and query model targets Postgres.
2. **A repository layer** (`src/db/repositories`) — route handlers and UI never touch Drizzle or SQL directly, so there's exactly one place to swap implementations.
3. **A configurable DB path** — never hardcoded.

Everything else (auth, tenancy, sync) was deliberately *not* built until the cloud tier actually started. When it did, adding it meant a second set of repository implementations behind the same ports — **not a single new screen and not one rewritten Server Action.**

```
        Server Components / Server Actions      ← identical in both modes
                       │
              repository-factory.ts             ← the only mode-aware seam
                 ┌─────┴─────┐
      SQLite repositories   Postgres repositories
             │                      │
      better-sqlite3          Supabase Postgres
      (DATABASE_PATH)         (owner-scoped queries)
```

### Engineering conventions worth knowing

- **Money is integer minor units, always.** Floats for money are forbidden repo-wide — a hard requirement for correct multi-currency reconciliation.
- **Server Actions, not a REST API.** ([ADR-0002](docs/adr/0002-server-actions-not-rest-api.md))
- **Typed domain errors thrown by domain/db code; route handlers and actions are the boundary that maps them to user-visible messages.**
- **UI copy lives in `src/i18n/messages/`, never inline in a component.** Server Actions return message *keys* (`LocalizedText`), so validation logic stays language-agnostic and its tests assert stable keys rather than English prose. Adding an English key is a compile error until the Chinese and Arabic catalogs define it too.
- **CSS uses logical properties** (`margin-inline-start`, `text-align: start`) so Arabic mirrors from the stylesheet rather than from a second set of rules.
- **Tests are colocated `*.test.ts`**, and database tests run against a *real* temp-file SQLite database (and a real local Postgres for the cloud tier) rather than mocks — SQLite is fast enough that mocking isn't worth the divergence risk.
- **Every architectural decision has an ADR**, including the reversed ones. [ADR-0006](docs/adr/0006-drop-rls-for-app-layer-owner-filtering.md) supersedes [ADR-0005](docs/adr/0005-cloud-tier-owner-isolation-via-rls.md) and says so in the first paragraph, including the part where the original design was never actually built as written.

### Documentation map

| Document | What's in it |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | The domain glossary — every entity, defined precisely, with an explicit "avoid these synonyms" list |
| [`docs/CODEMAP.md`](docs/CODEMAP.md) | Module-by-module map: boundaries, data flows, current status, known gaps |
| [`docs/specs/`](docs/specs) | Per-feature behavioural specs (accounts, transactions, transfers, fixed deposits, reconciliation, import, email sync, share trading, UI) |
| [`docs/adr/`](docs/adr) | 13 architecture decision records, including superseded ones |
| [`docs/mcp-setup.md`](docs/mcp-setup.md) · [`docs/cron-setup.md`](docs/cron-setup.md) | Operational setup guides |

---

## Development workflow

```bash
pnpm install                 # install dependencies
pnpm exec next dev           # local SQLite mode in a browser
pnpm electron:dev            # desktop shell, from source
pnpm dev                     # cloud mode (needs Supabase — see Option C)

pnpm test                    # full Vitest suite
pnpm test src/domain/fx.test.ts   # single file — preferred while iterating
pnpm typecheck               # tsc --noEmit
pnpm lint                    # eslint via next lint
```

The suite is ~130 colocated test files. **For the full `pnpm test` run, local Postgres is required via the local Supabase stack** (`pnpm supabase:start`, requires Docker): Postgres tests connect to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (override with `TEST_DATABASE_URL`) and Auth tests to `http://127.0.0.1:54321` (`TEST_SUPABASE_URL` / `TEST_SUPABASE_PUBLISHABLE_KEY`). Everything else runs with no services at all.

**Schema changes:** edit `src/db/schema.ts` and regenerate with Drizzle Kit — never hand-edit files in `drizzle/`. Cloud-tier changes go in `postgres/migrations/` as ordered SQL and are applied automatically on the next boot.

---

## Building and releasing

```bash
pnpm build                   # production Next.js build
pnpm electron:start          # local-mode production build, then the desktop app
pnpm electron:package        # macOS .dmg+.zip + Windows .exe (on macOS), or Linux .AppImage + Windows .exe (on Linux) into dist/electron/
pnpm release                 # tests → typecheck → package → GitHub Release → Vercel deploy
```

`pnpm electron:start` forces `DEPLOYMENT_MODE=local` on `next build`. A cloud value in `.env.local` would otherwise replace `better-sqlite3` with the cloud stub in the production server, and the desktop app would fail to open its database.

`pnpm release` accepts `--skip-tests`, `--skip-typecheck`, `--skip-electron`, `--skip-github`, `--skip-vercel`. It needs `gh auth login` for the GitHub Release step and a linked Vercel project (or `VERCEL_TOKEN`) for the deploy step.

The Electron packaging step builds whichever platforms the host it runs on can produce: a macOS host builds the `.dmg`/`.zip` plus a Windows `.exe` installer (NSIS, x64); a Linux host builds the same Windows `.exe` and a Linux `.AppImage` — no Windows machine required. Building the Windows installer from Linux does need **Wine** installed (`wine` + the 32-bit `wine32:i386` package), since electron-builder runs the freshly built installer through Wine to generate its uninstaller; macOS needs no Wine, but on Apple Silicon it needs **Rosetta 2** (`softwareupdate --install-rosetta --agree-to-license`) because electron-builder's bundled `makensis` is x86_64-only. The script checks for both up front and fails with install instructions if they're missing. Pass target platforms explicitly (`pnpm exec bash scripts/package-electron.sh mac linux win`) to override the default.

The packaging script takes desktop privacy seriously: it moves every `.env*` file out of the project root before building and **asserts none made it into the packaged tree**, so cloud credentials can't be accidentally inlined into a desktop binary via `NEXT_PUBLIC_*`.

**CI:** `.github/workflows/deploy.yml` runs on every push to `main` (and manually via `workflow_dispatch`). It starts the local Supabase stack (`pnpm supabase:start`) so the Postgres/Auth test suite can run, then `pnpm release -- --skip-electron --skip-github` (tests → typecheck → Vercel deploy). It needs repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (Vercel dashboard → project → Settings → General, and account/team Settings → General for the org ID) since CI has no interactive `vercel link` session. Vercel production env vars (`DEPLOYMENT_MODE`, Supabase URL/key, `POSTGRES_URL`) still live in the Vercel project, not here.

---

## Project status and known gaps

This is an actively developed personal project, published in the open. Stated honestly:

**Working today:** the full local tier (all nine core entities, ledger, transfers, fixed deposits, reconciliation/discrepancy/adjustment, share trading, MCP import, email sync), the Electron desktop app, and the cloud tier — every screen and Server Action runs against Postgres, with Supabase Auth, sign-in/sign-up/Google OAuth, and MCP token auth.

**Known gaps, deliberately:**

- **No local ↔ cloud migration tool.** Moving a dataset between tiers is a future decision, not an assumed one.
- **Nothing auto-starts the local email-sync poller** — you run `pnpm email-sync:poll` yourself today.
- **No desktop installers published on this repo yet** — `pnpm electron:package`/`pnpm release` build a macOS `.dmg`/`.zip` plus a Windows installer on macOS, and a Windows installer plus a Linux AppImage on Linux (see [Building and releasing](#building-and-releasing)). The macOS build is only ad-hoc signed (not notarised); the Windows and Linux builds are unsigned.
- **No review UI for unresolved email alerts** whose account couldn't be matched deterministically (they're recorded with a failure reason, but assignment is manual).
- **Share trading is intentionally minimal**: no cash legs, no cost basis, no valuation, no reconciliation equivalent.
- **The MCP endpoint has no OAuth flow**, so hosted AI clients that require dynamic client registration can't connect ([ADR-0008](docs/adr/0008-mcp-endpoint-adds-scoped-oauth-for-remote-clients.md) proposes it).
- **Some error text is English-only in every language.** Messages thrown by the repository layer (`src/db/errors.ts`) compose their prose at the throw site, often with counts folded in (“This Account still has 3 Transactions”). They reach the UI untranslated through `src/app/domain-error-text.ts`. Everything the UI and Server Actions author themselves is translated.
- **The zh/ar translations are unreviewed by native speakers.** They were written alongside the code, not by a translator.
- **The dev-only demo seed screen (`/dev/seed`) stays English** — it redirects away in production.
- **No billing, no multi-user datasets, no sharing** — out of scope by design.

`docs/CODEMAP.md` keeps a running, unflattering list of gaps as they open and close.

---

## FAQ

<details>
<summary><b>Does this connect to my bank?</b></summary><br>

No — and it never will ask for online-banking credentials. There's no Plaid/Yodlee/screen-scraping integration in the codebase. It works from artifacts you already have: statements you download (imported with AI assistance over MCP) and the alert emails your bank already sends you (IMAP sync). That's a deliberate product choice, not a missing feature.
</details>

<details>
<summary><b>Is my financial data sent anywhere?</b></summary><br>

In local mode, with email sync off: **no outbound network requests at all.** No telemetry, no analytics, no crash reporting. Your ledger is a SQLite file on your disk.

In cloud mode, your data is in **your** Supabase project. Turning on email sync adds calls to the IMAP and LLM hosts *you* configure — and you can point the LLM at a local Ollama instance so nothing leaves your machine. See [Privacy and data ownership](#privacy-and-data-ownership).
</details>

<details>
<summary><b>Do I need Supabase to use this?</b></summary><br>

No. Supabase is a **cloud-mode-only** dependency (Postgres + Auth). The desktop app and self-hosted local mode never load the Supabase SDK at all — cloud modules are dynamic-imported behind `isCloudMode()`. Local mode needs no accounts, no keys, and no `.env` file.
</details>

<details>
<summary><b>Which mode should I pick?</b></summary><br>

**Local/desktop** if you want your ledger on your own disk and you mostly use one machine — this is the default posture the project was built around. **Cloud** if you want to reach the same data from a phone and a laptop without syncing a file yourself, and you're comfortable running a Supabase project.
</details>

<details>
<summary><b>Can the desktop app use cloud mode?</b></summary><br>

No, by design. The Electron shell forces `DEPLOYMENT_MODE=local`, exposes no storage-mode switch, and hard-returns `false` from `isCloudMode()`. Cloud is a browser concern. The reasoning — and what reversing it would cost — is in [ADR-0007](docs/adr/0007-electron-desktop-is-local-only.md).
</details>

<details>
<summary><b>How do I back up my data? Where does it live?</b></summary><br>

**Local:** one SQLite file. Desktop defaults to `~/Library/Application Support/Paisa-Watch/paisa-watch.db`; running from source defaults to `./paisa-watch.db`. Copy the file, or set `DATABASE_PATH` (or the Settings screen) to a Dropbox/iCloud/Syncthing folder and get sync plus versioned backups for free. **Cloud:** it's your Supabase project — use Supabase's backups. Also back up `EMAIL_SYNC_ENCRYPTION_KEY` separately; losing it makes saved IMAP credentials unrecoverable.
</details>

<details>
<summary><b>Can I move my data from local to cloud (or back)?</b></summary><br>

Not with a built-in tool yet — it's an explicit known gap. Both tiers use the same Drizzle schema shape, so a migration script is tractable; it just hasn't been written, and writing it speculatively would violate the project's own rule about not building ahead of need.
</details>

<details>
<summary><b>Can my spouse and I share one dataset?</b></summary><br>

No. Every dataset belongs to exactly one Owner, in both tiers — no household mode, no shared access, no per-record permissions. Cloud mode is multi-*Owner* (many isolated people on one deployment), never multi-*user-per-dataset*.
</details>

<details>
<summary><b>Why integer minor units instead of decimals?</b></summary><br>

Because floating-point arithmetic silently loses cents, and this app's entire purpose is detecting sub-unit discrepancies between two independently computed balances. A reconciliation engine built on floats would generate phantom discrepancies and mask real ones. Every amount in the codebase is an integer of paise/cents; floats for money are forbidden.
</details>

<details>
<summary><b>Does the AI see my bank statements?</b></summary><br>

With MCP import, **your** assistant reads the file and sends the app structured rows — Money Watch itself never receives the document. With email sync, the app does send bank-alert email text to the LLM host you configured, which is the one deliberate exception ([ADR-0009](docs/adr/0009-email-alert-sync-calls-llm-server-side.md)); point it at a local Ollama server if you'd rather that stayed on your machine.
</details>

<details>
<summary><b>Do I have to use the AI features at all?</b></summary><br>

No. Both are entirely opt-in. Every entity the app models can be entered by hand through the UI; MCP import and email sync are conveniences layered on top, and the app works fully without ever configuring either.
</details>

<details>
<summary><b>Which currencies are supported?</b></summary><br>

Any. Each Account is denominated in a single currency, and cross-currency Transfers carry the FX rate actually realised rather than a looked-up market rate. It's been exercised mostly with INR, USD, SGD and AED.
</details>

<details>
<summary><b>Why do paths and the package name still say paisa-watch?</b></summary><br>

The product and this GitHub repo are **Money Watch**. The npm package name, Electron app id, and on-disk paths stay `paisa-watch` / `Paisa-Watch` so existing local databases and `appData/Paisa-Watch` installs keep working.
</details>

<details>
<summary><b>macOS says the app is damaged or from an unidentified developer.</b></summary><br>

The macOS build is ad-hoc signed but not notarised (a Developer ID certificate costs money). After the first blocked launch, open **System Settings → Privacy & Security** and click **Open Anyway**, or run `xattr -dr com.apple.quarantine "/Applications/Money Watch.app"`. If you'd rather not run an unsigned binary, clone the repo and run `pnpm electron:package` to build the identical artifact yourself.
</details>

<details>
<summary><b>Why Server Actions instead of a REST API?</b></summary><br>

Because a single-Owner app with a server-rendered UI gains nothing from an HTTP contract between its own halves, and pays for it in boilerplate and drift. The seam that actually mattered — swapping the data tier — lives at the repository layer instead, which is precisely what let cloud mode reuse every existing screen. Reasoning in [ADR-0002](docs/adr/0002-server-actions-not-rest-api.md).
</details>

<details>
<summary><b>Is it production-ready? Should I trust it with real money data?</b></summary><br>

It's a personal system of record used by its author, published in the open, at `v0.1.0` — not a bank-grade product with a support contract. The domain logic is covered by ~130 colocated test files, database tests run against real SQLite/Postgres rather than mocks, and cross-owner isolation is verified per repository method. It's also the author's own ledger, which is the strongest incentive there is for correctness. Keep backups, read [Known gaps](#project-status-and-known-gaps), and judge for yourself.
</details>

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. Read [`CONTEXT.md`](CONTEXT.md) — the domain vocabulary is fixed and enforced; don't introduce synonyms it rules out.
2. Check [`docs/CODEMAP.md`](docs/CODEMAP.md) for module boundaries, and update it in the same change if you move, rename, or re-scope a module.
3. Update this README in the same PR if your change touches anything it documents — commands, env vars, deployment modes, privacy posture, features, prerequisites, or known gaps.
4. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before pushing.
5. Money stays in integer minor units; data access stays behind the repository layer; the DB path stays configurable. These three are non-negotiable.

Good first contributions: publishing signed/notarised builds (macOS and Windows are currently unsigned), a local↔cloud migration script, a review UI for unresolved email alerts, or additional bank-alert email formats for the parser.

## License

Copyright © 2026 Vishal Yadav. Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

| Use | Allowed? |
| --- | --- |
| Personal, educational, research, and other **noncommercial** use | Yes — under the license terms (use, study, modify, distribute for noncommercial purposes) |
| **Commercial** use (selling, hosting as a paid service, using inside a for-profit product/business, etc.) | No — not under this license. Ask the author for a separate commercial permission (open a GitHub issue) |

This is **source-available**, not OSI/FSF “open source”: the code is public for noncommercial use, and commercial use needs written permission.

---

<div align="center">
<sub>Built with Next.js, TypeScript, Drizzle, SQLite, Supabase, and Electron.<br/>
<b>Independent verification over trust.</b></sub>
</div>
