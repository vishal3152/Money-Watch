---
status: superseded by ADR-0006 (owner isolation is now app-layer `owner_id` filtering, not RLS)
---

# Cloud-hosted tier isolates Owners via Postgres RLS, not separate databases or app-layer filtering alone

Paisa-Watch is adding a cloud-hosted tier (Supabase Postgres + Supabase Auth) alongside the existing self-hosted SQLite tier, offered as an in-app switch inside the same Electron app plus a browser-only deployment. All customers on the cloud tier share one Supabase project; the isolating line between them is Postgres Row-Level Security, enforced in addition to repository-layer filtering — not one Supabase project per customer, and not application-layer filtering alone. Every table in the cloud schema carries an `owner_id`, and RLS policies scope all reads/writes to `auth.uid()`. We chose this because a single missed `WHERE owner_id = ...` in a repository method would otherwise leak one customer's bank data to another; RLS makes that failure mode structurally impossible rather than merely unlikely, which matters given the stakes — other people's financial records. Self-hosted mode is unaffected: it keeps zero auth and a single implicit Owner, exactly as before.

## Considered Options

- App-layer filtering only, no RLS — rejected: a single missing filter clause in any repository method becomes a cross-tenant data leak, with no second line of defense.
- One Supabase project per customer — rejected: unmanageable at any real scale (provisioning, migrations, and billing all multiply per customer).
- Multi-user shared datasets (e.g. household/joint accounts) — rejected for v1: adds real membership modeling with no current requirement; one Owner per dataset is the simplest cardinality that satisfies "isolated per customer," and can be extended later without a rewrite.
- Separate app/codebase for the cloud tier — rejected: the existing repository-layer design was already a deliberate bet toward exactly this kind of driver swap; a second codebase would duplicate every screen and contradict that bet.
