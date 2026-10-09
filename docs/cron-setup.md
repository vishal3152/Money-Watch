# Setting up the cloud email-sync cron job

How to turn on the Vercel Cron job that polls every Owner's mailbox for bank alert
emails in the cloud tier. See `docs/specs/email-alert-sync.md` for what it actually does;
this page is only the deployment-side setup steps. Local tier (desktop, self-hosted)
doesn't use this — see that spec's "Known gap" note for how the local poll process starts
instead.

## 1. Set `CRON_SECRET`

In the Vercel dashboard: **Project → Settings → Environment Variables**, add
`CRON_SECRET` (Production environment). Use a high-entropy random string of **at least
32 characters** (e.g. `openssl rand -hex 32`). Shorter values are rejected by the route.
Vercel automatically sends this value back as `Authorization: Bearer <value>` on every
cron invocation; `/api/cron/email-sync` checks it with a constant-time compare and
rejects anything else with 401.

Don't reuse a secret from anywhere else — this one only needs to prove the request came
from Vercel's own scheduler, nothing more.

## 2. Deploy

`vercel.json` already declares the cron job:

```json
"crons": [
  { "path": "/api/cron/email-sync", "schedule": "0 8 * * *" }
]
```

Deploying the project (`git push` to the branch Vercel builds, or `vercel deploy --prod`)
registers it automatically — no separate step. Confirm it under **Project → Settings →
Cron Jobs** in the dashboard.

**Schedule note:** shipped as `0 8 * * *` (once daily, 08:00 UTC) because the project is
on the Hobby plan — Hobby only allows daily cron schedules, and anything finer (e.g.
`0 * * * *`, hourly) fails deployment outright. Upgrade to Vercel Pro or higher to tighten
this. See [Vercel's cron expression
reference](https://vercel.com/docs/cron-jobs#cron-expressions) for other patterns.

## 3. Each Owner configures their own mailbox

The cron job itself needs no per-project mailbox configuration — it reads every Owner's
saved settings at run time. Each Owner sets their own IMAP host/port/username/app
password, and LLM base URL/model (API key optional) at **Settings → Email Alert Sync** while signed in. A
poll simply does nothing for an Owner who hasn't saved settings yet.

## 4. Verify it worked

- **Dashboard logs** — Project → Cron Jobs → the job's **View Logs** link shows each
  invocation and its response body: `{ "results": [{ "ownerId": "...", "ok": true,
  "matched": 0, "unresolved": 0, "invalid": 0, "skipped": 0 }, ...] }` (empty array if no
  Owner has settings saved yet).
- **Manual trigger, once deployed** — call the route directly with the same header Vercel
  sends:

  ```
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-deployment>/api/cron/email-sync
  ```

  A real bank alert email sitting unseen in a configured Owner's mailbox should show up
  as a new `ImportBatch` at `/imports` shortly after.

## Troubleshooting

- **401 Unauthorized** — `CRON_SECRET` isn't set, or the caller didn't send a matching
  `Authorization: Bearer` header. Vercel's own scheduler always sends this once step 1 is
  done; a 401 from the dashboard's cron logs specifically means the env var is missing or
  wrong in that environment (check you added it to **Production**, not only Preview).
- **404 Not Found** — the route 404s when `isCloudMode()` is false. This should never
  happen on an actual Vercel deployment (cloud mode is implied there); it's the
  route protecting itself if somehow hit against a local/self-hosted build.
- **Deployment fails with a cron-schedule error** — the project is on the Hobby plan and
  `schedule` was tightened past once-daily. Revert to a daily expression or upgrade the
  plan.
- **A specific Owner's `ok` is `false`** — that Owner's own result carries an `error`
  string (bad IMAP credentials, unreachable mailbox, LLM failure). One Owner
  failing never blocks the others in the same run — each is caught independently.
- **Nothing shows up even though `ok: true`** — check `matched`/`unresolved`/`invalid`
  in the result. `unresolved` means the alert's claimed account-number suffix or
  institution name didn't match exactly one of that Owner's Accounts (no review UI for
  this yet — see the spec's "Known gap"); `invalid` means the LLM's response didn't
  validate as a structured alert.

## Not covered

- Confirming the Vercel plan supports sub-daily crons (Pro+) before deploying step 2 —
  this page doesn't do that for you.
- Local-tier polling (desktop, self-hosted) is a separate process (`pnpm email-sync:poll`)
  with its own setup, not this cron job — see `docs/specs/email-alert-sync.md`.
