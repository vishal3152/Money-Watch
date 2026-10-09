import { describe, expect, it } from "vitest";

import { hasPostgresErrorCode } from "@/db/errors";

describe("hasPostgresErrorCode", () => {
  it("finds the code on the error itself", () => {
    expect(hasPostgresErrorCode({ code: "23505" }, "23505")).toBe(true);
  });

  it("finds the code nested under .cause, as drizzle-orm wraps a driver error", () => {
    const drizzleQueryError = { message: "Failed query: insert ...", cause: { code: "23505" } };
    expect(hasPostgresErrorCode(drizzleQueryError, "23505")).toBe(true);
  });

  it("does not require the nested error to be an instance of any particular class", () => {
    // Reproduces the observed live failure: an error carrying the right Postgres error code that
    // fails `instanceof PostgresError` because the "postgres" package resolved to a different
    // module instance than the one the catch site imported (see the comment on the function).
    class UnrelatedClass {
      code = "23505";
    }
    expect(hasPostgresErrorCode({ cause: new UnrelatedClass() }, "23505")).toBe(true);
  });

  it("returns false when no code in the chain matches", () => {
    expect(hasPostgresErrorCode({ cause: { code: "23503" } }, "23505")).toBe(false);
  });

  it("returns false for null, undefined, and non-object errors", () => {
    expect(hasPostgresErrorCode(null, "23505")).toBe(false);
    expect(hasPostgresErrorCode(undefined, "23505")).toBe(false);
    expect(hasPostgresErrorCode("plain string error", "23505")).toBe(false);
  });

  it("does not loop forever on a self-referential cause chain", () => {
    const circular: { code: string; cause?: unknown } = { code: "other" };
    circular.cause = circular;
    expect(hasPostgresErrorCode(circular, "23505")).toBe(false);
  });
});
