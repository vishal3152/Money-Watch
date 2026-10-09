import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { getAuthProvider } from "@/config/auth-provider";
import { isCloudMode } from "@/config/deployment-mode";

export async function getOwnerIdFromSession(
  supabase: Pick<SupabaseClient, "auth">
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return null;
  }

  const sub = data.claims.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

export async function getOwnerEmailFromSession(
  supabase: Pick<SupabaseClient, "auth">
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return null;
  }

  const email = data.claims.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}

// Wrapped in React's cache() so the (network-bound) claims check runs once per
// request — getCurrentOwnerId() and getCurrentOwnerEmail() both read from this
// instead of each calling supabase.auth.getClaims() separately, which
// previously cost signed-in pages a second Auth round trip just to render the
// header's email (docs/qa/cloud-db-operations-audit.md).
const getCurrentOwnerClaims = cache(async (): Promise<Record<string, unknown> | null> => {
  if (!isCloudMode() || getAuthProvider() !== "supabase") {
    return null;
  }

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return null;
  }

  return data.claims;
});

/** AUTH_PROVIDER=simple resolves identity straight from the signed session
 * cookie — the owner id and email both come from the same decoded email, so
 * this is cached per request the same way getCurrentOwnerClaims() is, letting
 * getCurrentOwnerId() and getCurrentOwnerEmail() share one cookie read. */
const getCurrentSimpleIdentity = cache(async (): Promise<{ ownerId: string; email: string } | null> => {
  if (!isCloudMode() || getAuthProvider() !== "simple") {
    return null;
  }

  const { cookies } = await import("next/headers");
  const { SIMPLE_SESSION_COOKIE, deriveOwnerId, verifySessionToken } = await import("@/lib/simple-auth/session");
  const store = await cookies();
  const identity = await verifySessionToken(store.get(SIMPLE_SESSION_COOKIE)?.value);

  return identity ? { ownerId: await deriveOwnerId(identity.email), email: identity.email } : null;
});

export const getCurrentOwnerId = cache(async (): Promise<string | null> => {
  if (getAuthProvider() === "simple") {
    return (await getCurrentSimpleIdentity())?.ownerId ?? null;
  }

  const claims = await getCurrentOwnerClaims();
  const sub = claims?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
});

export async function getCurrentOwnerEmail(): Promise<string | null> {
  if (getAuthProvider() === "simple") {
    return (await getCurrentSimpleIdentity())?.email ?? null;
  }

  const claims = await getCurrentOwnerClaims();
  const email = claims?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}
