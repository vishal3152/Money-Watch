import {
  type EmailAlertDraft,
  type ParsedEmailAlert,
  validateEmailAlertFields
} from "@/domain/email-alert";

export type EmailAlertInput = {
  subject: string;
  body: string;
  /** Display name (or bare address) from the message's own IMAP `From` header — the forwarder's
   * identity when the owner manually forwarded a bank alert, or the true sender otherwise.
   * Optional so existing callers/tests that don't construct this field keep working (treated the
   * same as an unknown sender, like `receivedAt` elsewhere in this pipeline). */
  senderName?: string;
  /** Sender embedded in a "---------- Forwarded message ---------" block found in the body
   * (`extract-original-sender.ts`), when the owner manually forwarded the email. Null/undefined
   * when the mailbox received the message directly, or no such block was found. */
  originalSenderName?: string | null;
};

/**
 * What one email turned out to be. `ignored` (not a bank transaction alert at all) and `invalid`
 * (a real alert whose fields the owner has to fix) are deliberately different outcomes: only the
 * second is worth keeping — see docs/specs/email-alert-sync.md.
 */
export type ParseAlertEmailResult =
  | { status: "ignored" }
  | { status: "valid"; alert: ParsedEmailAlert }
  | { status: "invalid"; draft: EmailAlertDraft; invalidFields: string[] };

export type ParseAlertEmailDeps = {
  /** Calls the configured LLM with `input` and returns its raw structured-output JSON (untrusted). */
  callLlm: (input: EmailAlertInput) => Promise<unknown>;
  /** Cheap sender+subject pre-filter (docs/specs/email-alert-sync.md) run before `callLlm` — a
   * mailbox full of non-bank mail (telecom bills, OTPs, marketing) must not burn tokens on a full
   * body parse for every message. `callLlm` is never invoked when this returns false. */
  classifyIsTransactionUpdate: (input: {
    senderName?: string;
    originalSenderName?: string | null;
    subject: string;
  }) => Promise<boolean>;
};

export async function parseAlertEmail(
  input: EmailAlertInput,
  deps: ParseAlertEmailDeps
): Promise<ParseAlertEmailResult> {
  const isTransactionUpdate = await deps.classifyIsTransactionUpdate({
    senderName: input.senderName,
    originalSenderName: input.originalSenderName,
    subject: input.subject
  });
  if (!isTransactionUpdate) {
    return { status: "ignored" };
  }

  const result = validateEmailAlertFields(await deps.callLlm(input));
  return result.valid
    ? { status: "valid", alert: result.alert }
    : { status: "invalid", draft: result.draft, invalidFields: result.invalidFields };
}
