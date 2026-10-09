import { InvalidEmailAlertError } from "@/domain/email-alert";
import { assertSafeLlmBaseUrlResolved } from "@/email-sync/assert-safe-llm-host";
import type { EmailAlertInput } from "@/email-sync/parse-alert-email";

/** `fetch` has no default timeout — an unresponsive LLM host would otherwise hold a cloud cron
 * invocation open for its entire remaining budget, starving every Owner still queued behind it. */
const REQUEST_TIMEOUT_MS = 30_000;

const EMAIL_ALERT_JSON_SCHEMA = {
  type: "object",
  properties: {
    direction: { type: "string", enum: ["credit", "debit"] },
    amount: { type: "string", description: "Unsigned decimal string, e.g. \"1282.05\"." },
    currencyCode: { type: "string", description: "e.g. \"INR\"." },
    occurredAt: { type: "string", description: "Calendar date the alert occurred on, as YYYY-MM-DD." },
    accountNumberSuffix: { type: "string", description: "Trailing digits of the masked account number, e.g. \"1602\" from \"XXXX1602\"." },
    institutionName: { type: "string", description: "The bank's name, e.g. \"RBL Bank\"." },
    description: { type: "string" },
    reference: { type: ["string", "null"] },
    balance: { type: ["string", "null"], description: "Claimed available/closing balance as a decimal string, or null if not stated." }
  },
  required: [
    "direction",
    "amount",
    "currencyCode",
    "occurredAt",
    "accountNumberSuffix",
    "institutionName",
    "description",
    "reference",
    "balance"
  ],
  additionalProperties: false
};

/** Explicit field list for providers that ignore `response_format` (e.g. Ollama). Only these
 * fields are needed to match an Account and create an ImportBatch; `reference`/`balance` are
 * optional nullables kept for schema completeness and are not written into the import. */
export const EMAIL_ALERT_SYSTEM_PROMPT = `Extract one bank debit/credit alert into a single JSON object. Respond with ONLY that JSON object — no markdown, no commentary.

Required fields (use exactly these keys):
- "direction": "credit" or "debit"
- "amount": unsigned decimal string only, e.g. "1282.05" — no currency symbol, commas, or sign
- "currencyCode": ISO currency code as in the email, e.g. "INR"
- "occurredAt": transaction calendar date as YYYY-MM-DD
- "accountNumberSuffix": last 4 or more digits of the masked account number, e.g. "1602" from "XXXX1602"
- "institutionName": bank / institution name as stated in the email
- "description": short plain-text description of the transaction
- "reference": UTR / reference / transaction id string, or null if not stated
- "balance": available/closing balance as a decimal string, or null if not stated

Do not invent values you cannot find in the email. Prefer null over guessing for reference and balance.`;

const TRANSACTION_CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    isTransactionUpdate: {
      type: "boolean",
      description: "true only if this is a bank/financial-institution transaction alert."
    }
  },
  required: ["isTransactionUpdate"],
  additionalProperties: false
};

/** Pre-filter prompt (docs/specs/email-alert-sync.md): runs on sender name + subject only, before
 * the full body is ever sent to the LLM, so a mailbox full of non-bank mail doesn't burn tokens on
 * a full structured-output parse for every message. Telecom/utility bills are called out explicitly
 * because they mention amounts and "payment" just like a real bank alert but are not one. */
export const TRANSACTION_CLASSIFIER_SYSTEM_PROMPT = `You are a pre-filter for a personal finance app's email alert pipeline. You are given only an email's SENDER NAME(S) and SUBJECT LINE — never the body — and must decide whether this email is a bank/financial-institution transaction alert: a debit, credit, UPI/NEFT/IMPS/RTGS transfer, card transaction, or account-balance notification from a bank, wallet, brokerage, or card issuer.

Answer false for anything else, including but not limited to:
- Telecom, ISP, or utility bills, recharge confirmations, data-usage warnings, or "payment due"/"payment received" notices from a mobile carrier, broadband provider, or utility company — these often mention amounts and the word "payment" but are NOT bank transaction alerts.
- OTPs, login alerts, promotional offers, marketing emails, multi-transaction statements/summaries, KYC/document requests, or account-opening/welcome emails.
- E-commerce order confirmations, invoices, or subscription renewal notices from a non-financial merchant.

When a second sender name is given as "Originally from", the email was forwarded and that second name is embedded further inside the message — it is the more reliable signal of who actually sent it. Weigh both names, but prefer the "Originally from" one when they disagree about the sending organization.

Respond only with the JSON object the schema describes.`;

export type LlmClientConfig = {
  /** Full chat-completions endpoint URL as entered in Settings — used as-is, nothing appended.
   * e.g. "https://openrouter.ai/api/v1/chat/completions" or "http://localhost:11434/v1/chat/completions". */
  baseUrl: string;
  /** Omitted entirely from the request when blank/undefined (e.g. a local Ollama server that
   * requires no auth) rather than sent as an empty bearer token. */
  apiKey?: string;
  model: string;
  /** Cloud mode only (docs/adr/0013-provider-agnostic-llm-config-with-cloud-only-host-safety.md):
   * runs assertSafeLlmBaseUrlResolved before every call. Local/self-hosted mode passes false so a
   * localhost/private-network Ollama host is reachable — that is the point of this feature. */
  enforceHostSafety: boolean;
  /** Defaults to global `fetch` — overridable for tests. */
  fetchImpl?: typeof fetch;
};

/** Ollama's native chat API (`/api/chat`) — not the OpenAI-compatible `/v1/chat/completions`
 * shim. Native defaults to NDJSON streaming and uses `format` + `message.content` instead of
 * OpenAI's `response_format` + `choices[0].message.content`. */
function isOllamaNativeChatEndpoint(endpoint: string): boolean {
  return /\/api\/chat$/i.test(endpoint);
}

function extractAssistantContent(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;

  const choices = record.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object" && choices[0] !== null) {
    const message = (choices[0] as Record<string, unknown>).message;
    if (message && typeof message === "object" && message !== null) {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") return content;
    }
  }

  // Ollama native `/api/chat` (stream:false): { message: { role, content }, done: true }
  const message = record.message;
  if (message && typeof message === "object" && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }

  return undefined;
}

/**
 * Shared POST mechanics for every chat-completions call this module makes (the full email-alert
 * parse and the sender/subject pre-filter below): structured-output request, timeout, and
 * wrapping a non-JSON/missing-content response into `InvalidEmailAlertError` rather than letting
 * an uncaught exception abort the whole poll. Host-safety memoization stays with each caller
 * closure below (it's per-caller-instance state, not shared request plumbing).
 */
async function postStructuredChatCompletion(params: {
  fetchImpl: typeof fetch;
  endpoint: string;
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  jsonSchemaName: string;
  jsonSchema: object;
}): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const messages = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userContent }
  ];
  // Always disable streaming: Ollama `/api/chat` defaults to NDJSON lines, which makes
  // `JSON.parse` of the whole body throw and (worse) abort the whole poll instead of marking
  // one message invalid. OpenAI-compatible hosts already default to stream:false; being
  // explicit is harmless there.
  const requestBody = isOllamaNativeChatEndpoint(params.endpoint)
    ? { model: params.model, messages, stream: false, format: params.jsonSchema }
    : {
        model: params.model,
        messages,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: { name: params.jsonSchemaName, strict: true, schema: params.jsonSchema }
        }
      };
  console.info(`[email-sync] LLM request url=${params.endpoint} body=${JSON.stringify(requestBody)}`);

  const response = await params.fetchImpl(params.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers,
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(
      `[email-sync] LLM request failed status=${response.status} endpoint=${params.endpoint} body=${responseText}`
    );
    throw new Error(`LLM request failed (${response.status}): ${responseText}`);
  }

  console.info(`[email-sync] LLM response status=${response.status} body=${responseText}`);

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    // NDJSON / truncated / otherwise unparseable HTTP body — treat as this one message's
    // content being bad, not a transport failure that should abort the poll.
    throw new InvalidEmailAlertError("payload");
  }

  const content = extractAssistantContent(body);
  if (typeof content !== "string") {
    throw new InvalidEmailAlertError("payload");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new InvalidEmailAlertError("payload");
  }
}

/**
 * Builds the `callLlm` dependency `parseAlertEmail` (src/email-sync/parse-alert-email.ts)
 * expects: structures one bank alert email into JSON via an OpenAI-compatible chat-completions
 * endpoint's structured-output mode. `config.baseUrl` is the full endpoint URL from Settings —
 * posted to as-is (only a trailing slash is stripped). `validateParsedEmailAlert`
 * (src/domain/email-alert.ts) is what actually trusts the response — but a response that isn't
 * valid JSON at all (e.g. a provider that doesn't honor `response_format`, such as Ollama's
 * OpenAI-compatible layer) must still be treated as this one message's content being invalid, not
 * an uncaught exception that aborts the whole poll — see `postStructuredChatCompletion` above.
 */
export function createLlmCaller(config: LlmClientConfig): (input: EmailAlertInput) => Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = config.baseUrl.replace(/\/$/, "");
  // Cached across every call this one caller makes (one poll pass processes many messages, each
  // invoking callLlm once) so a many-message backlog doesn't re-resolve DNS per message and eat
  // into the cron route's tight per-invocation time budget — the resolved address itself cannot
  // change mid-poll in any way that matters here, so caching the check's outcome for the lifetime
  // of this caller is safe.
  let hostSafetyCheck: Promise<void> | null = null;

  return async function callLlm(input: EmailAlertInput): Promise<unknown> {
    if (config.enforceHostSafety) {
      hostSafetyCheck ??= assertSafeLlmBaseUrlResolved(config.baseUrl);
      await hostSafetyCheck;
    }

    return postStructuredChatCompletion({
      fetchImpl,
      endpoint,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: EMAIL_ALERT_SYSTEM_PROMPT,
      userContent: `Subject: ${input.subject}\n\n${input.body}`,
      jsonSchemaName: "email_alert",
      jsonSchema: EMAIL_ALERT_JSON_SCHEMA
    });
  };
}

export type TransactionSenderInfo = {
  /** Display name (or bare address) from the message's own IMAP `From` header — the forwarder's
   * identity when the owner manually forwarded a bank alert, or the true sender otherwise.
   * Optional to match `EmailAlertInput.senderName`'s existing-caller/test compatibility. */
  senderName?: string;
  /** Sender embedded in a "---------- Forwarded message ---------" block found in the body
   * (`extract-original-sender.ts`), when the owner manually forwarded the email. Null/undefined
   * when the mailbox received the message directly, or no such block was found. */
  originalSenderName?: string | null;
  subject: string;
};

/**
 * Builds the `classifyIsTransactionUpdate` dependency `parseAlertEmail` calls before the full
 * body-parsing LLM call (docs/specs/email-alert-sync.md): a cheap binary pre-filter run on just
 * the sender name(s) and subject, so a mailbox full of non-bank mail (telecom bills, OTPs,
 * marketing) doesn't burn tokens on a full structured-output parse for every message. Only a
 * message classified true here goes on to `createLlmCaller`'s full parse.
 */
export function createEmailClassifier(config: LlmClientConfig): (input: TransactionSenderInfo) => Promise<boolean> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = config.baseUrl.replace(/\/$/, "");
  let hostSafetyCheck: Promise<void> | null = null;

  return async function classifyIsTransactionUpdate(input: TransactionSenderInfo): Promise<boolean> {
    if (config.enforceHostSafety) {
      hostSafetyCheck ??= assertSafeLlmBaseUrlResolved(config.baseUrl);
      await hostSafetyCheck;
    }

    const senderName = input.senderName || "(unknown sender)";
    const userContent = input.originalSenderName
      ? `Sender: ${senderName}\nOriginally from: ${input.originalSenderName}\nSubject: ${input.subject}`
      : `Sender: ${senderName}\nSubject: ${input.subject}`;

    const raw = await postStructuredChatCompletion({
      fetchImpl,
      endpoint,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt: TRANSACTION_CLASSIFIER_SYSTEM_PROMPT,
      userContent,
      jsonSchemaName: "transaction_email_classification",
      jsonSchema: TRANSACTION_CLASSIFICATION_JSON_SCHEMA
    });

    if (typeof raw !== "object" || raw === null || typeof (raw as Record<string, unknown>).isTransactionUpdate !== "boolean") {
      throw new InvalidEmailAlertError("isTransactionUpdate");
    }
    return (raw as { isTransactionUpdate: boolean }).isTransactionUpdate;
  };
}
