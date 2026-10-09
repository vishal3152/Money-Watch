"use client";

import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import { useTranslator } from "@/i18n/client";
import {
  LIST_PAGE_SIZE,
  hasMoreItems,
  nextLoadedPages,
  visibleItemCount
} from "@/app/list-pagination";

export function CollapsibleSectionList({
  headingId,
  heading,
  toggleLabel,
  trailing,
  total,
  onNeedMore,
  defaultExpanded = true,
  children
}: {
  headingId: string;
  heading: ReactNode;
  toggleLabel: string;
  trailing?: ReactNode;
  /**
   * How many items exist in total, when that is more than the caller has
   * rendered — the Account ledger fetches its rows a page at a time. Defaults to
   * the rendered count, which is every other caller's case.
   */
  total?: number;
  /** Called when revealing would run past the rendered items, so the caller can fetch the next page. */
  onNeedMore?: () => void;
  /** Every caller expands on first render except the Dashboard's per-Institution
   * sections after the first populated one — those start collapsed so several
   * Institutions do not push the create-new actions below the fold before the
   * Owner has looked at anything. The first populated Institution starts open. */
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  const items = Children.toArray(children);
  const itemTotal = total ?? items.length;
  const listId = `${headingId}-list`;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loadedPages, setLoadedPages] = useState(1);
  const scrollRef = useRef<HTMLUListElement>(null);
  const visible = visibleItemCount(itemTotal, loadedPages);
  const more = hasMoreItems(itemTotal, loadedPages);
  const paged = itemTotal > LIST_PAGE_SIZE;

  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (!list || !paged) {
      if (list) {
        list.style.maxHeight = "";
      }
      return;
    }
    if (list.dataset.pageHeightLocked === "true") {
      return;
    }
    const rows = Array.from(list.children).filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && !node.classList.contains("pw-list-more-peek")
    );
    if (rows.length === 0) {
      return;
    }
    const height = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
    list.style.maxHeight = `${height}px`;
    list.dataset.pageHeightLocked = "true";
  }, [expanded, paged, visible]);

  useEffect(() => {
    if (!expanded || !more) {
      return;
    }
    const list = scrollRef.current;
    if (!list) {
      return;
    }
    function onScroll() {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
        setLoadedPages((current) => nextLoadedPages(current, itemTotal));
      }
    }
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => list.removeEventListener("scroll", onScroll);
  }, [expanded, more, itemTotal]);

  // Revealing has run past what the caller has rendered — ask for the next page.
  useEffect(() => {
    if (onNeedMore && visible > items.length) {
      onNeedMore();
    }
  }, [onNeedMore, visible, items.length]);

  const toggleExpanded = () => {
    setExpanded((current) => {
      if (current) {
        setLoadedPages(1);
      }
      return !current;
    });
  };

  return (
    <>
      <div
        className="pw-section-heading pw-section-heading--expandable"
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          // Nested controls in the actions cluster keep their own job.
          if (target.closest(".pw-section-heading-actions, input, select, textarea")) {
            return;
          }
          // Heading links (e.g. Dashboard Institution name → detail) must still
          // navigate. Expand only from plain heading text / row chrome; the
          // chevron remains the dedicated control when the heading is a Link.
          if (target.closest("h2 a")) {
            return;
          }
          toggleExpanded();
        }}
      >
        <h2 id={headingId}>{heading}</h2>
        <div className="pw-section-heading-actions">
          {trailing}
          <button
            type="button"
            className="pw-section-toggle"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-label={
              expanded
                ? t("common.collapseSection", { section: toggleLabel })
                : t("common.expandSection", { section: toggleLabel })
            }
            onClick={toggleExpanded}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 6.5 8 10.5 12 6.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {expanded ? (
        <ul
          id={listId}
          ref={scrollRef}
          className={paged ? "pw-list pw-list-paged" : "pw-list"}
        >
          {items.slice(0, visible)}
          {more ? <li className="pw-list-more-peek" aria-hidden="true" /> : null}
        </ul>
      ) : null}
    </>
  );
}
