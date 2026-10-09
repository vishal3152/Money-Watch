import { isIP } from "node:net";

import { BLOCKED_HOSTNAMES, isBlockedIpAddress } from "@/domain/imap-host-safety";

export class UnsafeLlmHostError extends Error {
  constructor(
    public readonly url: string,
    reason: string
  ) {
    super(`LLM base URL "${url}" is not allowed (${reason}).`);
    this.name = "UnsafeLlmHostError";
  }
}

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Sync check for settings-form validation, **both tiers**: rejects an empty value, a malformed
 * URL, and a non-http(s) scheme. Does not check for a private/blocked host — that half is
 * `assertSafeLlmBaseUrl` below, applied cloud-mode only. Split out so local/self-hosted mode still
 * gets basic "is this URL even usable" feedback at save time instead of a confusing failure only
 * surfacing later at poll time (localhost is a perfectly valid value there, so it can't share
 * `assertSafeLlmBaseUrl`'s full check).
 */
export function assertValidLlmBaseUrl(url: string): void {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new UnsafeLlmHostError(url, "empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeLlmHostError(url, "must be a valid URL, e.g. https://openrouter.ai/api/v1");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeLlmHostError(url, "must use http or https");
  }
}

/**
 * Full check for settings-form validation, **cloud mode only** (`docs/adr/0013-provider-agnostic-
 * llm-config-with-cloud-only-host-safety.md`): everything `assertValidLlmBaseUrl` checks, plus a
 * blocked hostname/literal IP, the same set `assertSafeImapHostname` blocks. Local/self-hosted mode
 * never calls this — the whole point of a configurable LLM host is letting the Owner point it at
 * their own machine's Ollama on localhost. Does not resolve DNS — call
 * `assertSafeLlmBaseUrlResolved` before the actual fetch.
 */
export function assertSafeLlmBaseUrl(url: string): void {
  assertValidLlmBaseUrl(url);

  const hostname = normalizeHostname(new URL(url.trim()).hostname);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeLlmHostError(url, "blocked hostname");
  }

  const ipLiteral = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(ipLiteral) && isBlockedIpAddress(ipLiteral)) {
    throw new UnsafeLlmHostError(url, "private or link-local address");
  }
}
