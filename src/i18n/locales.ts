export const SUPPORTED_LOCALES = ["en", "zh", "ar"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Language preference is per browser/profile, not per Account — it lives in a
 * cookie so both the Electron shell and the cloud tier read it the same way. */
export const LOCALE_COOKIE_NAME = "pw-locale";

/** Native-script names, so the picker is readable to a speaker of each language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية"
};

/** Compact form of `LOCALE_LABELS` for the header trigger on narrow viewports, where the
 * full native name crowds the nav links beside it. Chinese is already short enough to use
 * as-is; Arabic uses the everyday short form rather than a romanized code. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  en: "En",
  zh: "中文",
  ar: "عربي"
};

/** BCP 47 tags for `Intl` and the `lang` attribute. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en",
  zh: "zh-Hans",
  ar: "ar"
};

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}
