export type ResolveLoopbackPortOptions = {
  preferredPort: number;
  isPortFree: (port: number) => boolean | Promise<boolean>;
  maxAttempts?: number;
};

/**
 * Picks a fixed loopback port for the local Next server, falling back to the
 * next port up when the preferred one is occupied. A fixed (rather than
 * random) port matters because cloud-mode session cookies (Supabase Auth or
 * AUTH_PROVIDER=simple) are scoped to it — a random port on every relaunch
 * would sign the user out each time.
 */
export async function resolveLoopbackPort({
  preferredPort,
  isPortFree,
  maxAttempts = 20
}: ResolveLoopbackPortOptions): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;

    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No free loopback port found starting at ${preferredPort}.`);
}
