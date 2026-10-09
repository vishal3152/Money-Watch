import { isLoopbackHost } from "@/app/api/mcp/loopback-guard";

/**
 * Cloud SSRF guard for llmBaseUrl (docs/adr/0013) — skipped on a loopback Host so local
 * `DEPLOYMENT_MODE=cloud` can reach Ollama. Production Vercel Hosts are never loopback.
 */
export function shouldEnforceLlmHostSafety(cloudMode: boolean, requestHost: string | null): boolean {
  return cloudMode && !isLoopbackHost(requestHost);
}
