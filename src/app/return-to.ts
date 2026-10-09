/**
 * Validates a `returnTo` query/form value as a safe same-origin path before
 * using it as a redirect target — rejects protocol-relative (`//host/...`)
 * and absolute (`https://...`) values to avoid an open redirect.
 */
export function resolveReturnTo(value: string | null | undefined, fallback: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("://")) {
    return value;
  }
  return fallback;
}
