"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "@/i18n/locales";
import { createTranslator, type Translator } from "@/i18n/translator";

const TranslatorContext = createContext<Translator | null>(null);

/**
 * Carries the active locale's catalog into client components. The catalog is
 * passed in from the server layout rather than imported here, so the client
 * bundle never ships all three languages.
 */
export function LocaleProvider({
  locale,
  catalog,
  children
}: {
  locale: Locale;
  catalog: Record<string, string>;
  children: ReactNode;
}) {
  const translator = useMemo(() => createTranslator(locale, catalog), [locale, catalog]);

  return <TranslatorContext.Provider value={translator}>{children}</TranslatorContext.Provider>;
}

export function useTranslator(): Translator {
  const translator = useContext(TranslatorContext);

  if (!translator) {
    throw new Error("useTranslator must be used inside LocaleProvider.");
  }

  return translator;
}
