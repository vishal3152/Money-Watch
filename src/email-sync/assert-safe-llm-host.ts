import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isBlockedIpAddress } from "@/domain/imap-host-safety";
import { assertSafeLlmBaseUrl, UnsafeLlmHostError } from "@/domain/llm-host-safety";

/**
 * Full pre-fetch SSRF check for cloud mode (`docs/adr/0013-provider-agnostic-llm-config-with-
 * cloud-only-host-safety.md`): hostname shape + every resolved A/AAAA address must be public.
 * Call immediately before each LLM fetch when `enforceHostSafety` is true.
 *
 * Unlike `assertSafeImapHostResolved`, this does not pin the fetch to the resolved address —
 * undici's `fetch` has no equivalent of `ImapFlow`'s `servername`/pre-resolved-address connect
 * option without a custom dispatcher. A narrow DNS-rebinding TOCTOU window therefore remains
 * between this check and the fetch call itself; closing it fully was judged disproportionate to
 * this feature's risk (see the ADR).
 */
export async function assertSafeLlmBaseUrlResolved(url: string): Promise<void> {
  assertSafeLlmBaseUrl(url);

  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeLlmHostError(url, "DNS lookup failed");
  }

  if (addresses.length === 0) {
    throw new UnsafeLlmHostError(url, "DNS lookup returned no addresses");
  }

  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new UnsafeLlmHostError(url, `resolves to blocked address ${address}`);
    }
  }
}
