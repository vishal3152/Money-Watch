import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveReturnTo } from "@/app/return-to";
import { syncOwnerEmailBestEffort, type SyncOwnerEmail } from "@/app/login/sync-owner-email";

export type HandleAuthCallbackParams = {
  code: string | null;
  origin: string;
  /** Where to send the browser after a successful exchange. Defaults to "/" —
   * OAuth and signup-confirmation callers never pass this; the password-reset
   * request sets it to "/login/reset-password" so the recovery link lands on
   * the new-password form instead of the dashboard. Validated via
   * `resolveReturnTo` before use — this value round-trips through a public
   * email link, so it must never be trusted as an open redirect target. */
  next?: string;
  supabase: Pick<SupabaseClient, "auth">;
  syncOwnerEmail?: SyncOwnerEmail;
};

/**
 * The decision logic behind the OAuth callback route: exchange the
 * provider's authorization code for a Supabase session, and say where to
 * send the browser next. Kept separate from route.ts (an untestable Next.js
 * Route Handler) the same way session-gate.ts is kept separate from
 * middleware.ts.
 */
function loginRedirectWithError(origin: string, code: string): string {
  return `${origin}/login?error=${code}`;
}

export async function handleAuthCallback({
  code,
  origin,
  next,
  supabase,
  syncOwnerEmail
}: HandleAuthCallbackParams): Promise<string> {
  if (!code) {
    return loginRedirectWithError(origin, "sign_in_cancelled");
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return loginRedirectWithError(origin, "link_expired");
  }

  await syncOwnerEmailBestEffort(data.user?.id, data.user?.email, syncOwnerEmail);

  return `${origin}${resolveReturnTo(next, "/")}`;
}
