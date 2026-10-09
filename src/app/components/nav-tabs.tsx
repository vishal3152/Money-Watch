"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTranslator } from "@/i18n/client";

const TABS = [
  { href: "/", labelKey: "nav.dashboard", isActive: (pathname: string) => pathname === "/" },
  { href: "/imports", labelKey: "nav.imports", isActive: (pathname: string) => pathname.startsWith("/imports") },
  { href: "/settings", labelKey: "nav.settings", isActive: (pathname: string) => pathname.startsWith("/settings") }
] as const;

/**
 * Renders the same Dashboard/Imports/Settings links twice: inline for wide viewports, and
 * behind a hamburger-triggered left drawer for narrow ones (CSS switches between the two —
 * see `.pw-nav`/`.pw-nav-trigger` in globals.css). A single component keeps the tab list and
 * active-route logic in one place instead of splitting it across an inline nav and a drawer nav.
 */
export function NavTabs() {
  const pathname = usePathname();
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Route changes (a drawer link was followed) should close the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  return (
    <>
      <nav className="pw-nav" aria-label={t("nav.primary")}>
        {TABS.map((tab) => {
          const active = tab.isActive(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="pw-nav-link"
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : undefined}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        className="pw-menu pw-nav-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("nav.menu")}
        onClick={() => setOpen(true)}
      >
        <svg className="pw-menu-icon pw-nav-trigger-icon" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M3 5.5h14M3 10h14M3 14.5h14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open
        ? createPortal(
            <div className="pw-nav-drawer-root" role="presentation">
              <button
                type="button"
                className="pw-nav-drawer-backdrop"
                aria-label={t("select.close")}
                onClick={() => setOpen(false)}
              />
              <div
                className="pw-nav-drawer-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className="pw-nav-drawer-header">
                  <h2 id={titleId}>{t("nav.menu")}</h2>
                  <button
                    ref={closeRef}
                    type="button"
                    className="pw-nav-drawer-close"
                    onClick={() => setOpen(false)}
                  >
                    {t("select.close")}
                  </button>
                </div>
                <ul className="pw-nav-drawer-list">
                  {TABS.map((tab) => {
                    const active = tab.isActive(pathname);
                    return (
                      <li key={tab.href}>
                        <Link
                          href={tab.href}
                          className="pw-nav-drawer-link"
                          aria-current={active ? "page" : undefined}
                          data-active={active ? "true" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          {t(tab.labelKey)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
