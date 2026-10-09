export const LIST_PAGE_SIZE = 6;

/**
 * Rows the Account ledger fetches from the database per request, deliberately
 * larger than `LIST_PAGE_SIZE` (the client's reveal increment). Against a remote
 * database a round trip costs far more than the rows it carries, so fetching one
 * reveal's worth at a time would mean a round trip every six rows of scrolling.
 */
export const LEDGER_FETCH_SIZE = 60;

export function visibleItemCount(total: number, loadedPages: number): number {
  if (total <= 0 || loadedPages <= 0) {
    return 0;
  }
  return Math.min(total, loadedPages * LIST_PAGE_SIZE);
}

export function nextLoadedPages(loadedPages: number, total: number): number {
  if (visibleItemCount(total, loadedPages) >= total) {
    return loadedPages;
  }
  return loadedPages + 1;
}

export function hasMoreItems(total: number, loadedPages: number): boolean {
  return visibleItemCount(total, loadedPages) < total;
}

/**
 * The total to trust once a ledger page has arrived. A page that comes back
 * empty means rows were removed under the scroll, so the total is pinned to
 * what is actually held — without that the reveal gate would keep asking for
 * rows that will never arrive, fetching in a loop.
 */
export function ledgerTotalAfterFetch(
  loadedCount: number,
  reportedTotal: number,
  returnedCount: number
): number {
  return returnedCount === 0 ? loadedCount : reportedTotal;
}
