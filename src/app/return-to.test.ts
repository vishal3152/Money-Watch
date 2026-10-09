import { describe, expect, it } from "vitest";

import { resolveReturnTo } from "@/app/return-to";

describe("resolveReturnTo", () => {
  it("accepts a same-origin relative path", () => {
    expect(resolveReturnTo("/imports/batch-1", "/accounts/acc-1")).toBe("/imports/batch-1");
  });

  it("falls back when the value is missing", () => {
    expect(resolveReturnTo(undefined, "/accounts/acc-1")).toBe("/accounts/acc-1");
    expect(resolveReturnTo(null, "/accounts/acc-1")).toBe("/accounts/acc-1");
    expect(resolveReturnTo("", "/accounts/acc-1")).toBe("/accounts/acc-1");
  });

  it("rejects a protocol-relative path to avoid an open redirect", () => {
    expect(resolveReturnTo("//evil.example/", "/accounts/acc-1")).toBe("/accounts/acc-1");
  });

  it("rejects an absolute URL to avoid an open redirect", () => {
    expect(resolveReturnTo("https://evil.example/", "/accounts/acc-1")).toBe("/accounts/acc-1");
  });

  it("rejects a value that does not start with a slash", () => {
    expect(resolveReturnTo("accounts/acc-1", "/accounts/acc-1")).toBe("/accounts/acc-1");
  });
});
