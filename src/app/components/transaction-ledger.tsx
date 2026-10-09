"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadLedgerPage } from "@/app/accounts/[id]/ledger-actions";
import type { LedgerRow } from "@/app/accounts/[id]/ledger-page";
import { CollapsibleSectionList } from "@/app/components/collapsible-section-list";
import { TEXT_FIELD_MAX_LENGTH } from "@/app/form-limits";
import { DISPLAY_LOCALE, formatMinorUnits } from "@/app/format-money";
import { LIST_PAGE_SIZE, ledgerTotalAfterFetch } from "@/app/list-pagination";
import { useTranslator } from "@/i18n/client";

const SEARCH_DEBOUNCE_MS = 300;

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(DISPLAY_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatLedgerTimestamp(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function TransactionLedger({
  accountId,
  currencyCode,
  headingId,
  toggleLabel,
  initialRows,
  initialTotal,
  months,
  adjustmentReconciliationIds
}: {
  accountId: string;
  currencyCode: string;
  headingId: string;
  toggleLabel: string;
  initialRows: LedgerRow[];
  /** Unfiltered Transaction count for the Account — what the scroll gate counts down. */
  initialTotal: number;
  months: string[];
  /** Transaction id -> the Reconciliation its Adjustment corrects. Whole-Account, so it covers every page. */
  adjustmentReconciliationIds: Record<string, string>;
}) {
  const { t } = useTranslator();
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);

  // Bumped on every filter change so a slow in-flight response cannot overwrite
  // the results of a newer one.
  const requestId = useRef(0);
  const fetchingMore = useRef(false);
  const isFirstRender = useRef(true);

  // Filters run in SQL, not over `rows`: a search has to match Transactions that
  // were never fetched.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const handle = setTimeout(() => {
      const id = ++requestId.current;
      setLoading(true);
      loadLedgerPage({ accountId, offset: 0, search, month }).then((page) => {
        if (id !== requestId.current) {
          return;
        }
        setRows(page.rows);
        setTotal(page.total);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [accountId, search, month]);

  const handleNeedMore = useCallback(() => {
    if (fetchingMore.current || rows.length >= total) {
      return;
    }
    fetchingMore.current = true;
    const id = requestId.current;
    setLoading(true);
    loadLedgerPage({ accountId, offset: rows.length, search, month }).then((page) => {
      fetchingMore.current = false;
      if (id !== requestId.current) {
        return;
      }
      setRows((current) => [...current, ...page.rows]);
      setTotal(ledgerTotalAfterFetch(rows.length, page.total, page.rows.length));
      setLoading(false);
    });
  }, [accountId, rows.length, search, month, total]);

  const showFilters = initialTotal > LIST_PAGE_SIZE;
  const isFiltering = search.trim().length > 0 || month.length > 0;

  return (
    <>
      {showFilters ? (
        <div className="pw-ledger-filter">
          <div className="pw-field">
            <label htmlFor={`${headingId}-search`}>{t("ledger.searchLabel")}</label>
            <input
              id={`${headingId}-search`}
              type="text"
              value={search}
              maxLength={TEXT_FIELD_MAX_LENGTH}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ledger.searchPlaceholder")}
            />
          </div>
          <div className="pw-field">
            <label htmlFor={`${headingId}-month`}>{t("ledger.monthLabel")}</label>
            <select
              id={`${headingId}-month`}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">{t("ledger.allTime")}</option>
              {months.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <>
          {/* Always rendered: the enclosing section's aria-labelledby points here. */}
          <h2 id={headingId}>{t("ledger.heading")}</h2>
          <p className="pw-empty">
            {isFiltering ? t("ledger.noMatches") : t("ledger.empty")}
          </p>
        </>
      ) : (
        <CollapsibleSectionList
          // Remount on a filter change so the reveal count, scroll position and
          // locked row height all reset. Without it a filter settled after deep
          // scrolling still wants (say) 300 rows revealed while only the fresh
          // 60 are loaded, and backfills the gap one round trip at a time.
          key={`${search}|${month}`}
          headingId={headingId}
          heading={
            <>
              {t("ledger.heading")}
              <span className="pw-section-count">
                {isFiltering
                  ? t("ledger.filteredCount", { shown: total, total: initialTotal })
                  : total}
              </span>
            </>
          }
          toggleLabel={toggleLabel}
          total={total}
          onNeedMore={handleNeedMore}
        >
          {rows.map((row) => {
            const reconciliationId = adjustmentReconciliationIds[row.id];
            const isManual = row.transferId === null && reconciliationId === undefined;
            const isDebit = row.amountMinor < 0;
            // Every row leads exactly one place — the row is that link, not just
            // the small tag inside it (docs/agents/mobile-ux.md: whole rows tappable).
            const href = row.transferId
              ? `/transfers/${row.transferId}`
              : reconciliationId
                ? `/reconciliations/${reconciliationId}`
                : `/accounts/${accountId}/transactions/${row.id}/edit`;
            return (
              <li key={row.id}>
                <Link className="pw-ledger-row" href={href}>
                  <span className="pw-item-title">
                    {row.description.trim().length > 0 ? (
                      row.description
                    ) : (
                      <span className="pw-item-untitled">{t("ledger.noDescription")}</span>
                    )}
                    <span className="pw-item-sub">{formatLedgerTimestamp(row.occurredAt)}</span>
                  </span>
                  <span className="pw-item-amount">
                    <span
                      className={`pw-amount-direction pw-amount-direction--${isDebit ? "debit" : "credit"}`}
                      aria-hidden="true"
                    >
                      {isDebit ? "↓" : "↑"}
                    </span>
                    {formatMinorUnits(row.amountMinor, currencyCode)}
                    <span className="pw-item-tags">
                      <span className={`pw-trust-status pw-trust-status--${row.trustStatus.toLowerCase()}`}>
                        {t(`trustStatus.${row.trustStatus}`)}
                      </span>
                      {row.possibleDuplicateOfTransactionId !== null ? (
                        <span className="pw-duplicate-badge">{t("imports.suspectedDuplicate")}</span>
                      ) : null}
                      {row.category ? (
                        <span className="pw-category-tag">{t(`category.${row.category}`)}</span>
                      ) : null}
                      {row.transferId ? <span className="pw-item-tag-text">{t("ledger.transferTag")}</span> : null}
                      {reconciliationId ? (
                        <span className="pw-item-tag-text">{t("ledger.adjustmentTag")}</span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </CollapsibleSectionList>
      )}

      <p className="pw-ledger-status" role="status" aria-live="polite">
        {loading ? t("ledger.loading") : null}
      </p>
    </>
  );
}
