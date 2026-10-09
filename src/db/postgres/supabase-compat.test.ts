import { describe, expect, it } from "vitest";

import { SUPABASE_COMPAT_BOOTSTRAP_SQL } from "@/db/postgres/supabase-compat";

describe("SUPABASE_COMPAT_BOOTSTRAP_SQL", () => {
  it("installs the auth.uid() and role stubs migrations expect on plain Postgres", () => {
    expect(SUPABASE_COMPAT_BOOTSTRAP_SQL).toContain("create schema if not exists auth");
    expect(SUPABASE_COMPAT_BOOTSTRAP_SQL).toContain("auth.uid()");
    expect(SUPABASE_COMPAT_BOOTSTRAP_SQL).toContain("create role authenticated");
    expect(SUPABASE_COMPAT_BOOTSTRAP_SQL).toContain("create role anon");
  });

  it("skips creating auth.uid() when it already exists (Supabase owns auth; app role cannot CREATE there)", () => {
    expect(SUPABASE_COMPAT_BOOTSTRAP_SQL).toContain("to_regprocedure('auth.uid()')");
  });
});
