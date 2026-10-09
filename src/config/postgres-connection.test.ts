import { afterEach, describe, expect, it } from "vitest";

import { resolvePostgresConnectionString } from "@/config/postgres-connection";

const ORIGINAL_ENV = process.env.POSTGRES_URL;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.POSTGRES_URL;
  } else {
    process.env.POSTGRES_URL = ORIGINAL_ENV;
  }
});

describe("resolvePostgresConnectionString", () => {
  it("defaults to the local Supabase Postgres connection string when POSTGRES_URL is unset", () => {
    delete process.env.POSTGRES_URL;

    expect(resolvePostgresConnectionString()).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });

  it("honors POSTGRES_URL when set", () => {
    process.env.POSTGRES_URL = "postgresql://example/prod";

    expect(resolvePostgresConnectionString()).toBe("postgresql://example/prod");
  });
});
