/**
 * How far email alert sync has read a mailbox: every IMAP message up to `lastMessageUid` has been
 * looked at, whatever the outcome. This pointer — not a stored row per message — is what stops a
 * later poll reprocessing mail it has already seen, so the database only ever holds alerts that
 * still need the owner (docs/specs/email-alert-sync.md).
 */
export type EmailSyncCursor = {
  mailbox: string;
  /** The mailbox's IMAP UIDVALIDITY the uids below belong to; null when the server reported none.
   * A changed value means the mailbox was recreated/migrated and uids restarted from 1. */
  uidValidity: string | null;
  lastMessageUid: number;
  updatedAt: string;
};

/** Splits the `UIDVALIDITY:uid` (or bare `uid`) message id the IMAP fetch produces. Null when the
 * id isn't in either shape — such a message is always processed, never skipped on a guess. */
export function parseEmailMessageUid(messageUid: string): { uidValidity: string | null; uid: number } | null {
  const match = /^(?:(\d+):)?(\d+)$/.exec(messageUid.trim());
  if (match === null) {
    return null;
  }
  return { uidValidity: match[1] ?? null, uid: Number(match[2]) };
}

export function isMessageAlreadySynced(cursor: EmailSyncCursor | null, messageUid: string): boolean {
  if (cursor === null) {
    return false;
  }
  const parsed = parseEmailMessageUid(messageUid);
  if (parsed === null || parsed.uidValidity !== cursor.uidValidity) {
    return false;
  }
  return parsed.uid <= cursor.lastMessageUid;
}

/**
 * The pointer after processing `messageUid`, or null when nothing needs to be written (the message
 * is at or below the pointer already, or its uid couldn't be parsed — moving the pointer on a uid
 * of unknown position would skip real messages).
 */
export function advanceEmailSyncCursor(
  cursor: EmailSyncCursor | null,
  input: { mailbox: string; messageUid: string; now: string }
): EmailSyncCursor | null {
  const parsed = parseEmailMessageUid(input.messageUid);
  if (parsed === null) {
    return null;
  }
  if (
    cursor !== null &&
    parsed.uidValidity === cursor.uidValidity &&
    parsed.uid <= cursor.lastMessageUid
  ) {
    return null;
  }
  return {
    mailbox: input.mailbox,
    uidValidity: parsed.uidValidity,
    lastMessageUid: parsed.uid,
    updatedAt: input.now
  };
}
