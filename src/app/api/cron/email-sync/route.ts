import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCronRequest, sanitizeCronOwnerError } from "@/app/api/cron/email-sync/cron-auth";
import { isCloudMode } from "@/config/deployment-mode";
import { resolvePostgresConnectionString } from "@/config/postgres-connection";
import {
  listAllEmailSyncCredentials,
  recordEmailSyncPollAttempt,
  PgEmailSyncSettingsRepository
} from "@/db/postgres/repositories/email-sync-settings-repository";
import { checkEmailSyncNow } from "@/email-sync/check-now";
import { fetchUnseenImapMessages } from "@/email-sync/imap-client";
import { createEmailClassifier, createLlmCaller } from "@/email-sync/llm-client";
import type { EmailAlertSyncPollResult } from "@/email-sync/run-email-alert-sync-poll";

// Node runtime, explicitly: this route imports imapflow/mailparser (via imap-client.ts), which
// break Next's edge bundling if reachable from a runtime-agnostic file like instrumentation.ts
// (see docs/specs/email-alert-sync.md). A route handler's `runtime` export tells Next to build
// this one route for Node only — no edge graph is ever generated for it.
export const runtime = "nodejs";

// Vercel serverless function ceiling for this route. Paired with POLL_BUDGET_MS below so the
// Owner loop always stops itself with enough headroom to return a response, rather than being
// killed mid-write by the platform's own hard timeout.
export const maxDuration = 60;

/** Wall-clock budget for the whole Owner loop, deliberately under `maxDuration`: an Owner with a
 * large unseen backlog or a slow mailbox/LLM response must not consume the entire
 * invocation and starve every Owner queued behind it. Owners not reached this run keep their old
 * `lastPolledAt` and sort first on the next invocation (see `listAllEmailSyncCredentials`). */
const POLL_BUDGET_MS = 45_000;

export type EmailSyncCronResult = { ownerId: string } & (
  | ({ ok: true } & EmailAlertSyncPollResult)
  | { ok: false; error: string }
);

/**
 * Vercel Cron entry point (ADR-0010, docs/specs/email-alert-sync.md): one poll pass per
 * configured Owner. `listAllEmailSyncCredentials` deliberately reads across every Owner — see
 * that function's own comment for why this is a narrow, intentional exception to the per-Owner
 * scoping every other cloud query follows.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isCloudMode()) {
    return NextResponse.json({ error: "Not available outside cloud mode" }, { status: 404 });
  }

  const connectionString = resolvePostgresConnectionString();
  // Ordered by lastPolledAt ascending (never-polled first) — an invocation that runs out of
  // budget below always leaves the Owners it skipped at the front of the next one.
  const allCredentials = await listAllEmailSyncCredentials(connectionString);

  const results: EmailSyncCronResult[] = [];
  const deadline = Date.now() + POLL_BUDGET_MS;

  for (const credentials of allCredentials) {
    if (Date.now() >= deadline) {
      break;
    }

    if (!credentials.ok) {
      // This Owner's row couldn't be decrypted (missing/rotated EMAIL_SYNC_ENCRYPTION_KEY, or a
      // corrupt stored value) — isolated per-row by listAllEmailSyncCredentials so it never
      // prevents every other Owner's poll from running.
      console.error(`[email-sync cron] owner ${credentials.ownerId} credentials unreadable:`, credentials.error);
      results.push({ ownerId: credentials.ownerId, ok: false, error: sanitizeCronOwnerError(credentials.error) });
      continue;
    }

    const statusRepository = new PgEmailSyncSettingsRepository(connectionString, credentials.ownerId);
    const outcome = await checkEmailSyncNow({
      pollDeps: {
        mailbox: credentials.imapUser,
        getCurrentOwnerId: async () => credentials.ownerId,
        isCloudMode: () => true,
        postgresConnectionString: connectionString,
        fetchUnseenMessages: () =>
          fetchUnseenImapMessages({
            host: credentials.imapHost,
            port: credentials.imapPort,
            user: credentials.imapUser,
            password: credentials.imapPassword
          }),
        // Cloud cron: enforceHostSafety true (docs/adr/0013-provider-agnostic-llm-config-with-
        // cloud-only-host-safety.md) — this call runs on shared infra for every configured Owner,
        // so a localhost/private target is a real SSRF risk here.
        callLlm: createLlmCaller({
          baseUrl: credentials.llmBaseUrl,
          apiKey: credentials.llmApiKey,
          model: credentials.llmModel,
          enforceHostSafety: true
        }),
        classifyIsTransactionUpdate: createEmailClassifier({
          baseUrl: credentials.llmBaseUrl,
          apiKey: credentials.llmApiKey,
          model: credentials.llmModel,
          enforceHostSafety: true
        })
      },
      writeStatus: (status) => statusRepository.setStatus(status),
      // One Owner's failure (bad credentials, unreachable mailbox, LLM outage) must not
      // abort every other Owner's poll in the same cron invocation. Never echo raw exception text
      // in the HTTP body — IMAP/LLM errors often embed secrets or mailbox details.
      sanitizeError: (error) => {
        console.error(`[email-sync cron] owner ${credentials.ownerId} failed:`, error);
        return sanitizeCronOwnerError(error);
      }
    });

    // Recorded regardless of outcome (checkEmailSyncNow never throws) — an Owner who was
    // attempted and failed still rotates to the back of the queue, the same as one who succeeded;
    // only an Owner never reached this run (the deadline/credentials-unreadable branches above)
    // keeps its old lastPolledAt.
    await recordEmailSyncPollAttempt(connectionString, credentials.ownerId, new Date().toISOString());

    results.push(
      outcome.ok
        ? { ownerId: credentials.ownerId, ok: true, ...outcome.result }
        : { ownerId: credentials.ownerId, ok: false, error: outcome.error }
    );
  }

  return NextResponse.json({ results });
}
