import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { assertSafeImapHostResolved } from "@/email-sync/assert-safe-imap-host";
import { buildImapCandidateSearchQuery } from "@/email-sync/imap-candidate-search";
import { extractOriginalSender } from "@/email-sync/extract-original-sender";
import type { FetchedEmailMessage } from "@/email-sync/run-email-alert-sync-poll";

export type ImapConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
};

/** Bounds one poll's IMAP fetch + LLM cost: an owner with a large unseen backlog (or a
 * cloud cron invocation covering many Owners) must not let one mailbox consume the whole request
 * budget. The remainder stays unseen and is picked up on the next poll. */
const DEFAULT_MAX_MESSAGES_PER_FETCH = 50;

/** Recency window for the "seen but not yet processed" half of the search below — bounds re-fetch
 * cost to a few days of mail rather than the whole mailbox, while still being wide enough to catch
 * a message the owner's phone marked read shortly after it arrived (comfortably longer than any
 * realistic poll interval or daemon downtime for a same-week catch-up). */
const RECENT_WINDOW_DAYS = 6;

/**
 * Fetches candidate INBOX messages over IMAP as plain text, up to `maxMessages`. Thin I/O plumbing,
 * deliberately untested (matches src/app/api/mcp/route.ts's convention) — the parsing/matching/write
 * logic it feeds is tested in run-email-alert-sync-poll.test.ts; the SEARCH shape lives in
 * imap-candidate-search.ts (tested). Idempotency against reprocessing an already-handled alert is
 * tracked separately via ProcessedEmailAlertRepository, never IMAP's own \Seen flag alone: the
 * search matches unseen messages of any age *or* any message (seen or not) from the last few days,
 * because the owner's own mail client/phone can mark a message read before this app ever sees it —
 * filtering on `{ seen: false }` alone would then silently and permanently skip it. Re-fetching an
 * already-processed recent message here is harmless and cheap
 * (ProcessedEmailAlertRepository.isProcessed skips it before any LLM call). On Gmail, Promotions
 * and Social category mail are excluded from SEARCH entirely (see imap-candidate-search.ts).
 */
export async function fetchUnseenImapMessages(
  config: ImapConnectionConfig,
  maxMessages: number = DEFAULT_MAX_MESSAGES_PER_FETCH
): Promise<FetchedEmailMessage[]> {
  // Connect to the exact address validated above, not a fresh resolution of config.host — ImapFlow
  // otherwise re-resolves the hostname itself at connect time, reopening the DNS-rebinding window
  // assertSafeImapHostResolved was just used to close. servername carries the original hostname
  // through for correct SNI/certificate-identity checking against the pinned IP.
  const target = await assertSafeImapHostResolved(config.host);

  console.info(
    `[email-sync] imap connect host=${config.host} resolved=${target.address} port=${config.port} user=${config.user}`
  );

  const client = new ImapFlow({
    host: target.address,
    port: config.port,
    secure: true,
    ...(target.servername !== null ? { servername: target.servername } : {}),
    auth: { user: config.user, pass: config.password },
    logger: false
  });

  await client.connect();
  console.info(`[email-sync] imap connected user=${config.user}`);
  const messages: FetchedEmailMessage[] = [];

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // IMAP UIDs are unique only within a (mailbox, UIDVALIDITY) pair — if the server ever resets
      // UIDVALIDITY (mailbox recreated/migrated), raw UIDs restart from 1 and would collide with
      // previously-recorded (mailbox, uid) processed-alert rows, silently skipping new messages as
      // already-processed. Folding it into the returned uid keeps the existing (mailbox, messageUid)
      // idempotency key correct across a reset without changing that key's shape anywhere else.
      const uidValidity = client.mailbox !== false ? client.mailbox.uidValidity : null;
      const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      // Gmail categories (Promotions/Social tabs) aren't ordinary IMAP labels — only X-GM-RAW
      // can exclude them. Skip that clause on non-Gmail servers so SEARCH doesn't fail closed.
      const supportGmailRawSearch = client.capabilities.has("X-GM-EXT-1");
      const searchQuery = buildImapCandidateSearchQuery({ recentSince, supportGmailRawSearch });
      if (supportGmailRawSearch) {
        console.info(
          `[email-sync] imap search excludes Gmail Promotions/Social user=${config.user}`
        );
      }

      for await (const message of client.fetch(searchQuery, { uid: true, source: true })) {
        if (messages.length >= maxMessages) {
          break;
        }
        if (!message.source) {
          continue;
        }
        const parsed = await simpleParser(message.source);
        const bodyText = parsed.text ?? "";
        const fromAddress = parsed.from?.value[0];
        messages.push({
          uid: uidValidity !== null ? `${uidValidity}:${message.uid}` : String(message.uid),
          subject: parsed.subject ?? "",
          body: bodyText,
          senderName: fromAddress?.name || fromAddress?.address || "",
          // Set only when the owner manually forwarded a bank alert (docs/specs/email-alert-sync.md)
          // — the classifier pre-filter weighs this over senderName (the forwarder) when present.
          originalSenderName: extractOriginalSender(bodyText),
          receivedAt: parsed.date instanceof Date ? parsed.date.toISOString() : null
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  console.info(`[email-sync] imap fetch done user=${config.user} count=${messages.length}`);
  return messages;
}
