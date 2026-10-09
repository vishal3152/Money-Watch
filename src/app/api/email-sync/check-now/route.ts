import { NextResponse } from "next/server";

import { sanitizeCronOwnerError } from "@/app/api/cron/email-sync/cron-auth";
import { shouldEnforceLlmHostSafety } from "@/app/settings/llm-host-safety-policy";
import { isCloudMode } from "@/config/deployment-mode";
import { readEmailSyncSettings } from "@/config/email-sync-settings";
import { writeEmailSyncStatus } from "@/config/email-sync-status";
import { resolvePostgresConnectionString } from "@/config/postgres-connection";
import { checkEmailSyncNow } from "@/email-sync/check-now";
import { fetchUnseenImapMessages } from "@/email-sync/imap-client";
import { createEmailClassifier, createLlmCaller } from "@/email-sync/llm-client";
import { shouldStartEmailAlertSyncPolling } from "@/email-sync/should-start-polling";
import { getCurrentOwnerId } from "@/lib/cloud-auth/current-owner";

// Node runtime, explicitly: this route imports imapflow/mailparser (via imap-client.ts), same as
// api/cron/email-sync/route.ts and for the same reason — see that route's comment.
export const runtime = "nodejs";

/**
 * Manual "Check now" for Email Alert Sync (docs/specs/email-alert-sync.md, UI review follow-up):
 * runs one poll pass on demand instead of waiting for the next scheduled tick, and records the
 * outcome so a broken mailbox connection is visible on /settings.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (isCloudMode()) {
    const ownerId = await getCurrentOwnerId();
    if (ownerId === null) {
      return NextResponse.json(
        { ok: false, error: "Sign in to check email alert sync.", errorKey: "errors.checkNowSignIn" },
        { status: 401 }
      );
    }

    const connectionString = resolvePostgresConnectionString();
    const { PgEmailSyncSettingsRepository } = await import(
      "@/db/postgres/repositories/email-sync-settings-repository"
    );
    const repository = new PgEmailSyncSettingsRepository(connectionString, ownerId);
    const credentials = await repository.get();

    if (!credentials) {
      return NextResponse.json(
        {
          ok: false,
          error: "Configure email alert sync before checking it.",
          errorKey: "errors.checkNowNotConfigured"
        },
        { status: 400 }
      );
    }

    // Same rule as saveEmailSyncSettings: enforce on shared cloud Hosts, skip on loopback so a
    // local cloud-mode `pnpm dev` can call Ollama. Cron on Vercel always keeps enforceHostSafety
    // true (its Host is never loopback).
    const enforceHostSafety = shouldEnforceLlmHostSafety(true, request.headers.get("host"));

    console.info(
      `[email-sync] check-now start mode=cloud ownerId=${ownerId} mailbox=${credentials.imapUser} imapHost=${credentials.imapHost} llmBaseUrl=${credentials.llmBaseUrl} llmModel=${credentials.llmModel} enforceHostSafety=${enforceHostSafety}`
    );

    const outcome = await checkEmailSyncNow({
      pollDeps: {
        mailbox: credentials.imapUser,
        getCurrentOwnerId: async () => ownerId,
        isCloudMode: () => true,
        postgresConnectionString: connectionString,
        fetchUnseenMessages: () =>
          fetchUnseenImapMessages({
            host: credentials.imapHost,
            port: credentials.imapPort,
            user: credentials.imapUser,
            password: credentials.imapPassword
          }),
        // Cloud mode: enforceHostSafety true on shared infra (docs/adr/0013); false on loopback.
        callLlm: createLlmCaller({
          baseUrl: credentials.llmBaseUrl,
          apiKey: credentials.llmApiKey,
          model: credentials.llmModel,
          enforceHostSafety
        }),
        classifyIsTransactionUpdate: createEmailClassifier({
          baseUrl: credentials.llmBaseUrl,
          apiKey: credentials.llmApiKey,
          model: credentials.llmModel,
          enforceHostSafety
        })
      },
      writeStatus: (status) => repository.setStatus(status),
      sanitizeError: sanitizeCronOwnerError
    });

    console.info(
      `[email-sync] check-now done mode=cloud ownerId=${ownerId} ok=${outcome.ok}` +
        (outcome.ok
          ? ` matched=${outcome.result.matched} unresolved=${outcome.result.unresolved} ignored=${outcome.result.ignored} skipped=${outcome.result.skipped}`
          : ` error=${outcome.error}`)
    );

    return NextResponse.json(outcome);
  }

  const settings = readEmailSyncSettings();
  if (!shouldStartEmailAlertSyncPolling(settings)) {
    return NextResponse.json(
      { ok: false, error: "Configure email alert sync before checking it." },
      { status: 400 }
    );
  }

  console.info(
    `[email-sync] check-now start mode=local mailbox=${settings.imapUser} imapHost=${settings.imapHost} llmBaseUrl=${settings.llmBaseUrl} llmModel=${settings.llmModel}`
  );

  const outcome = await checkEmailSyncNow({
    pollDeps: {
      mailbox: settings.imapUser!,
      fetchUnseenMessages: () =>
        fetchUnseenImapMessages({
          host: settings.imapHost!,
          port: settings.imapPort!,
          user: settings.imapUser!,
          password: settings.imapPassword!
        }),
      // Local (non-cloud) mode: enforceHostSafety false — see the cloud branch above for why
      // these differ.
      callLlm: createLlmCaller({
        baseUrl: settings.llmBaseUrl!,
        apiKey: settings.llmApiKey,
        model: settings.llmModel!,
        enforceHostSafety: false
      }),
      classifyIsTransactionUpdate: createEmailClassifier({
        baseUrl: settings.llmBaseUrl!,
        apiKey: settings.llmApiKey,
        model: settings.llmModel!,
        enforceHostSafety: false
      })
    },
    writeStatus: (status) => writeEmailSyncStatus(status),
    sanitizeError: sanitizeCronOwnerError
  });

  console.info(
    `[email-sync] check-now done mode=local ok=${outcome.ok}` +
      (outcome.ok
        ? ` matched=${outcome.result.matched} unresolved=${outcome.result.unresolved} ignored=${outcome.result.ignored} skipped=${outcome.result.skipped}`
        : ` error=${outcome.error}`)
  );

  return NextResponse.json(outcome);
}
