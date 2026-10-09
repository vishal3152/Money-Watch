---
status: accepted (supersedes ADR-0005's RLS-based isolation)
---

# App-layer owner filtering replaces RLS as the cloud tier's isolation mechanism

Every cloud-tier query now filters explicitly by `owner_id` in the repository layer; RLS is no longer the enforcement mechanism (policies remain defined in the schema, dormant — the app connects as the table-owning role, which bypasses RLS by default, rather than switching to a scoped role per query). We reversed ADR-0005 because establishing RLS scope per query — a transaction with two `set_config` calls and a `set local role` before every statement — measured at real cost against the actual remote pooler: ~2s of connection-setup overhead (since fixed by connection pooling, see `src/db/postgres/connection-pool.ts`) plus, even pooled, ~250ms per round trip × 6 round trips per call × ~9 calls on a typical page. The trade RLS bought — a missing `WHERE owner_id = ...` becomes a DB-level no-op instead of a leak — is real, and we're giving it up for latency. Every repository method's cross-owner isolation is now enforced by application code alone, verified per method by a dedicated cross-owner test — confirmed, not assumed: each converted repository had its filter deliberately broken and the corresponding test watched to go red, then restored, before being trusted.

## Considered Options

- Keep RLS, only collapse the two `set_config` calls into one — rejected: saves roughly 1 of 6 round trips per call; the floor with RLS kept is still ~5 round trips, not competitive with app-layer filtering's 1.
- Keep RLS as a second line of defense alongside app-layer filtering (defense in depth, as ADR-0005 originally intended) — rejected: RLS's cost is in establishing scope per query, not in the policies themselves: getting the safety net back means paying the same per-call role-switch cost RLS always required. "Both" isn't a cheaper hybrid, it's RLS's full cost plus new application-layer discipline on top.

## Consequences

- **ADR-0005's stated design was never actually built as described.** It says RLS is "enforced in addition to repository-layer filtering" — at the time it was written, no repository method filtered by `owner_id` at all (verified: `grep -rn "\.where(" src/db/postgres/repositories/*.ts` showed zero `ownerId`/`owner_id` predicates anywhere). RLS was the *only* isolation mechanism. This ADR closes that gap; it doesn't introduce it.
- Every cloud-tier query — reads and writes alike — must filter by `owner_id`, verified by a cross-owner isolation test for that method. There's no DB-level fallback anymore: a missing filter on a `select` is a live cross-tenant leak; on an `update`/`delete`, silent cross-tenant data corruption or loss, which the compound `(id, owner_id)` foreign keys do not catch (they constrain what a row can *reference*, not which rows a bare `update`/`delete` predicate can *touch*).
- RLS policies remain defined in `postgres/migrations/` and enabled on the live tables, deliberately left dormant rather than dropped. Reversing this decision later (e.g. if the app ever connects as a non-bypassing role) needs no new migration — only reintroducing the per-query role switch.
