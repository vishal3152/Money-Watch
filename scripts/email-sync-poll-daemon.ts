import { startEmailAlertSyncPolling } from "../src/email-sync/start-polling";

// Standalone process, never imported by the Next.js app: imapflow's dependency chain
// (@zone-eu/mailsplit) does bare `require("stream")` calls that fail Next's webpack bundling for
// the edge runtime (this app has edge middleware, so Next always compiles an edge graph too) even
// though the code never runs there. Running it as a separate `tsx`-invoked process — the same
// pattern as prepare-database.ts — keeps it out of that bundling entirely.
// Local-tier only (docs/specs/email-alert-sync.md). Known gap, documented in that spec: nothing
// currently starts this process automatically — not electron:dev/electron:start, not pnpm
// dev/start. The owner (or a self-hosted/Docker/NAS operator) runs `pnpm email-sync:poll` as its
// own long-lived process today; wiring it into electron/main.cjs as a sibling spawned child is
// unbuilt follow-up work.
startEmailAlertSyncPolling();
