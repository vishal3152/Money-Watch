"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTranslator } from "@/i18n/client";

/**
 * Dashboard header "+ Add" trigger — bottom sheet of create-new links for
 * Institution/Account/FixedDeposit/ShareTradingAccount. Mirrors
 * `InstitutionAddMenu` so the Owner finds the same pattern on both screens;
 * Transfer stays on the dashboard's sticky bottom action instead.
 */
export function DashboardAddMenu() {
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerLabel = t("dashboard.addMenu");
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
    { href: "/institutions/new", label: t("dashboard.addInstitution") },
    { href: "/accounts/new", label: t("dashboard.addAccount") },
    { href: "/fixed-deposits/new", label: t("dashboard.addFixedDeposit") },
    { href: "/share-trading-accounts/new", label: t("dashboard.addShareTradingAccount") }
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
