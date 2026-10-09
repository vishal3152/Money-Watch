import { describe, expect, it } from "vitest";

import {
  LIST_PAGE_SIZE,
  ledgerTotalAfterFetch,
  hasMoreItems,
  nextLoadedPages,
  visibleItemCount
} from "@/app/list-pagination";

describe("list pagination", () => {
  it("pages in sixes", () => {
    expect(LIST_PAGE_SIZE).toBe(6);
  });

  it("shows the first six items on the first page", () => {
    expect(visibleItemCount(20, 1)).toBe(6);
  });

  it("shows every item when the list fits on one page", () => {
    expect(visibleItemCount(4, 1)).toBe(4);
  });

  it("shows twelve items after two pages load", () => {
    expect(visibleItemCount(20, 2)).toBe(12);
  });

  it("never exceeds the total", () => {
    expect(visibleItemCount(8, 2)).toBe(8);
  });

  it("shows nothing when the list is empty", () => {
    expect(visibleItemCount(0, 1)).toBe(0);
  });

  it("advances one page while items remain", () => {
    expect(nextLoadedPages(1, 20)).toBe(2);
  });

  it("does not advance when every item is already visible", () => {
    expect(nextLoadedPages(2, 8)).toBe(2);
  });

  it("has more items after the first page of a seven-item list", () => {
    expect(hasMoreItems(7, 1)).toBe(true);
  });

  it("has no more items when the first page covers the list", () => {
    expect(hasMoreItems(6, 1)).toBe(false);
  });
});

describe("ledgerTotalAfterFetch", () => {
  it("keeps the reported total while pages are still arriving", () => {
    expect(ledgerTotalAfterFetch(60, 500, 60)).toBe(500);
  });

  it("keeps the reported total on the last partial page", () => {
    expect(ledgerTotalAfterFetch(480, 500, 20)).toBe(500);
  });

  it("pins the total to what is held when a page comes back empty, so the reveal gate stops", () => {
    // Rows were deleted under the scroll: the count says 500, but nothing more
    // is coming. Without pinning, hasMoreItems stays true and refetches forever.
    const pinned = ledgerTotalAfterFetch(60, 500, 0);

    expect(pinned).toBe(60);
    expect(hasMoreItems(pinned, 10)).toBe(false);
  });
});
