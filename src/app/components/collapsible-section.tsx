"use client";

import { useState, type ReactNode } from "react";

import { useTranslator } from "@/i18n/client";

/**
 * A generic collapsible `<section>` heading for arbitrary content (a form, a
 * guide, prose) — not a list. For a list of items with pagination/scroll-to-load,
 * use `CollapsibleSectionList` instead.
 */
export function CollapsibleSection({
  headingId,
  heading,
  toggleLabel,
  defaultExpanded = true,
  children
}: {
  headingId: string;
  heading: ReactNode;
  toggleLabel: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `${headingId}-content`;

  return (
    <>
      <div
        className="pw-section-heading pw-section-heading--expandable"
        onClick={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          if (target.closest("input, select, textarea, a, button:not(.pw-section-toggle)")) {
            return;
          }
          setExpanded((current) => !current);
        }}
      >
        <h2 id={headingId}>{heading}</h2>
        <div className="pw-section-heading-actions">
          <button
            type="button"
            className="pw-section-toggle"
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={
              expanded
                ? t("common.collapseSection", { section: toggleLabel })
                : t("common.expandSection", { section: toggleLabel })
            }
            onClick={() => setExpanded((current) => !current)}
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
      {expanded ? <div id={contentId}>{children}</div> : null}
    </>
  );
}
