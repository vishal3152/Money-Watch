export type AuthProvider = "supabase" | "simple";

/**
 * Cloud mode's auth backend. Only meaningful when `isCloudMode()` is true.
 * Defaults to Supabase so existing/unconfigured deployments are unaffected.
 */
export function getAuthProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "simple" ? "simple" : "supabase";
}
