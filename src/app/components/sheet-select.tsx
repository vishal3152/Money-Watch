"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { RequiredMark } from "@/app/components/required-mark";
import { useTranslator } from "@/i18n/client";

export type SheetSelectOption = {
  value: string;
  label: string;
};

/**
 * The sheet is portaled to `document.body` rather than rendered inline:
 * every caller nests this inside `.pw-card`, which has `backdrop-filter`, and
 * a `backdrop-filter`/`transform`/`filter` ancestor becomes the containing
 * block for a `position: fixed` descendant per spec — so a `fixed; inset: 0`
 * sheet left nested under the card sizes itself to (and bottom-anchors
 * within) the card's box instead of the viewport. On a tall, scrolled form
 * this puts the actual sheet off-screen below the fold while its backdrop
 * still dims the visible card, i.e. tapping the trigger appears to freeze —
 * reproduces on Safari/iOS, which is where `backdrop-filter` is supported.
 */
export function SheetSelect({
  id,
  name,
  label,
  value,
  options,
  onChange,
  disabled = false,
  required = false,
  errorId,
  invalid = false,
  error
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  options: readonly SheetSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  errorId?: string;
  invalid?: boolean;
  error?: string;
}) {
  const { t } = useTranslator();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

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
    <div className="pw-field">
      <label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <button
        id={id}
        type="button"
        className={invalid ? "pw-sheet-trigger is-invalid" : "pw-sheet-trigger"}
        disabled={disabled || options.length === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={errorId}
        onClick={() => setOpen(true)}
      >
        <span>{selected?.label ?? t("select.placeholder")}</span>
        <span className="pw-sheet-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {error ? (
        <p className="pw-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {open
        ? createPortal(
            <div className="pw-sheet-root" role="presentation">
              <button
                type="button"
                className="pw-sheet-backdrop"
                aria-label={t("select.close")}
                onClick={() => setOpen(false)}
              />
              <div
                className="pw-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className="pw-sheet-header">
                  <h2 id={titleId}>{label}</h2>
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
                  {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <li key={option.value}>
                        <button
                          type="button"
                          className={
                            isSelected ? "pw-sheet-option is-selected" : "pw-sheet-option"
                          }
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => {
                            onChange(option.value);
                            setOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
