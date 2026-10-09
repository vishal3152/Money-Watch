"use client";

import { useTransition } from "react";

import { SegmentedControl } from "@/app/components/segmented-control";
import { setLocale } from "@/app/settings/locale-actions";
import { useTranslator } from "@/i18n/client";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";

/** Three languages fit a segmented control, so the choice takes one tap and no dropdown. */
export function LanguageForm({ currentLocale }: { currentLocale: Locale }) {
  const { t } = useTranslator();
  const [pending, startTransition] = useTransition();

  return (
    <SegmentedControl
      value={currentLocale}
      options={SUPPORTED_LOCALES.map((locale) => ({
        value: locale,
        label: LOCALE_LABELS[locale]
      }))}
      onChange={(next) => {
        startTransition(async () => {
          await setLocale(next);
        });
      }}
      aria-label={t("settings.language.label")}
      disabled={pending}
    />
  );
}
