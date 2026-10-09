"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTranslator } from "@/i18n/client";

/**
 * The Institution detail header's "+ Account" trigger, opening a bottom sheet of
 * Add Account/FixedDeposit/ShareTradingAccount links instead of three
 * full-width buttons stacked below the page's lists — saves the vertical
 * space those took without losing any option.
 *
 * Portaled to `document.body` rather than rendered inline: `.pw-detail` has
 * `backdrop-filter`, and a `backdrop-filter`/`transform`/`filter` ancestor
 * becomes the containing block for a `position: fixed` descendant per spec —
 * see the same comment on `SheetSelect`.
 */
export function InstitutionAddMenu({ institutionId }: { institutionId: string }) {
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerLabel = t("institutions.detail.addMenu");
  const sheetHeading = t("dashboard.addSectionHeading");

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const options = [
    { href: `/accounts/new?institutionId=${institutionId}`, label: t("institutions.detail.addAccount") },
    {
      href: `/fixed-deposits/new?institutionId=${institutionId}`,
      label: t("institutions.detail.addFixedDeposit")
    },
    {
      href: `/share-trading-accounts/new?institutionId=${institutionId}`,
      label: t("institutions.detail.addShareTradingAccount")
    }
  ];

  return (
    <>
      <button
        type="button"
        className="pw-text-link-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open
        ? createPortal(
            <div className="pw-sheet-root" role="presentation">
              <button
                type="button"
                className="pw-sheet-backdrop"
                aria-label={t("select.close")}
                onClick={() => setOpen(false)}
              />
              <div className="pw-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <div className="pw-sheet-header">
                  <h2 id={titleId}>{sheetHeading}</h2>
                  <button
                    ref={closeRef}
                    type="button"
                    className="pw-sheet-close"
                    onClick={() => setOpen(false)}
                  >
                    {t("select.done")}
                  </button>
                </div>
                <ul className="pw-sheet-list">
                  {options.map((option) => (
                    <li key={option.href}>
                      <Link className="pw-sheet-option" href={option.href}>
                        {option.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
