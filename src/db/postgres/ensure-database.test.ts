import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseError } from "@/db/errors";

const postgresMock = vi.hoisted(() => vi.fn());

vi.mock("postgres", () => ({
  default: postgresMock
}));

import {
  ensurePostgresDatabaseReady,
  listPendingPostgresMigrationFiles,
  migrationVersionFromFilename,
  resolvePostgresMigrationsFolder
} from "@/db/postgres/ensure-database";

type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  unsafe: ReturnType<typeof vi.fn>;
  begin: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function createSqlClient(options?: {
  appliedVersions?: string[];
  beginImpl?: (fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
}): SqlClient {
  const appliedVersions = options?.appliedVersions ?? [];
  const unsafe = vi.fn().mockResolvedValue(undefined);
  const end = vi.fn().mockResolvedValue(undefined);

  const client = Object.assign(
    vi.fn(async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("schema_migrations") && text.includes("select")) {
        return appliedVersions.map((version) => ({ version }));
      }
      return undefined;
    }),
    { unsafe, begin: vi.fn(), end }
  ) as SqlClient;

  client.begin = vi.fn(
    options?.beginImpl ??
      (async (fn: (tx: SqlClient) => Promise<void>) => {
        await fn(client);
      })
  );

  return client;
}

describe("migrationVersionFromFilename", () => {
  it("reads the numeric prefix used as the applied-migration version", () => {
    expect(migrationVersionFromFilename("20260905010000_institutions.sql")).toBe("20260905010000");
  });
});

describe("resolvePostgresMigrationsFolder", () => {
  it("defaults to postgres/migrations under the process cwd", () => {
    expect(resolvePostgresMigrationsFolder()).toBe(join(process.cwd(), "postgres", "migrations"));
  });

  it("honors POSTGRES_MIGRATIONS_FOLDER when set", () => {
    const previous = process.env.POSTGRES_MIGRATIONS_FOLDER;
    process.env.POSTGRES_MIGRATIONS_FOLDER = "/tmp/custom-migrations";
    try {
      expect(resolvePostgresMigrationsFolder()).toBe("/tmp/custom-migrations");
    } finally {
      if (previous === undefined) {
        delete process.env.POSTGRES_MIGRATIONS_FOLDER;
      } else {
        process.env.POSTGRES_MIGRATIONS_FOLDER = previous;
      }
    }
  });
});

describe("listPendingPostgresMigrationFiles", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "paisa-pg-migrations-"));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("returns sql files sorted by name, skipping already-applied versions", () => {
    writeFileSync(join(folder, "20260905020000_accounts.sql"), "-- a");
    writeFileSync(join(folder, "20260905010000_institutions.sql"), "-- i");
    writeFileSync(join(folder, "readme.txt"), "ignore");

    expect(listPendingPostgresMigrationFiles(folder, new Set(["20260905010000"]))).toEqual([
      "20260905020000_accounts.sql"
    ]);
  });
});

describe("ensurePostgresDatabaseReady", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "paisa-pg-migrations-"));
    process.env.POSTGRES_MIGRATIONS_FOLDER = folder;
    postgresMock.mockReset();
  });

  afterEach(() => {
    delete process.env.POSTGRES_MIGRATIONS_FOLDER;
    rmSync(folder, { recursive: true, force: true });
  });

  it("bootstraps auth stubs then applies pending sql migrations from postgres/migrations", async () => {
    writeFileSync(join(folder, "20260905010000_institutions.sql"), "create table institutions ();");
    const client = createSqlClient({ appliedVersions: [] });
    postgresMock.mockReturnValue(client);

    await ensurePostgresDatabaseReady("postgresql://example");

    expect(postgresMock).toHaveBeenCalledWith("postgresql://example", { max: 1 });
    expect(client.unsafe).toHaveBeenCalledWith(expect.stringContaining("create schema if not exists auth"));
    expect(client.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("create schema if not exists supabase_migrations")
    );
    expect(client.unsafe).toHaveBeenCalledWith("create table institutions ();");
    const insertCalls = vi.mocked(client).mock.calls.filter((call) => {
      const fragments = call[0] as TemplateStringsArray | undefined;
      return typeof fragments?.[0] === "string" && fragments[0].includes("insert into supabase_migrations");
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.[1]).toBe("20260905010000");
    expect(insertCalls[0]?.[2]).toBe("20260905010000_institutions");
    expect(client.end).toHaveBeenCalled();
  });

  it("skips migrations whose version is already recorded", async () => {
    writeFileSync(join(folder, "20260905010000_institutions.sql"), "create table institutions ();");
    const client = createSqlClient({ appliedVersions: ["20260905010000"] });
    postgresMock.mockReturnValue(client);

    await ensurePostgresDatabaseReady("postgresql://example");

    expect(client.unsafe).toHaveBeenCalledWith(expect.stringContaining("create schema if not exists auth"));
    expect(client.unsafe).not.toHaveBeenCalledWith("create table institutions ();");
  });

  it("throws a DatabaseError when a migration statement fails", async () => {
    writeFileSync(join(folder, "20260905010000_institutions.sql"), "bad sql");
    const client = createSqlClient({
      appliedVersions: [],
      beginImpl: async () => {
        throw new Error("syntax error");
      }
    });
    postgresMock.mockReturnValue(client);

    await expect(ensurePostgresDatabaseReady("postgresql://example")).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it("throws a DatabaseError when compat bootstrap fails", async () => {
    const client = createSqlClient();
    client.unsafe.mockRejectedValueOnce(new Error("schema boom"));
    postgresMock.mockReturnValue(client);

    await expect(ensurePostgresDatabaseReady("postgresql://example")).rejects.toBeInstanceOf(
      DatabaseError
    );
  });
});
