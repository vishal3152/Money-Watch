import { describe, expect, it } from "vitest";

import { likeContainsPattern } from "@/db/like-pattern";

describe("likeContainsPattern", () => {
  it("wraps a lower-cased search in contains wildcards", () => {
    expect(likeContainsPattern("Groceries")).toBe("%groceries%");
  });

  it("escapes LIKE wildcards so they match literally", () => {
    expect(likeContainsPattern("50%")).toBe("%50\\%%");
    expect(likeContainsPattern("a_b")).toBe("%a\\_b%");
    expect(likeContainsPattern("back\\slash")).toBe("%back\\\\slash%");
  });

  it("matches everything for an empty search", () => {
    expect(likeContainsPattern("")).toBe("%%");
  });
});
