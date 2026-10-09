import { cookies } from "next/headers";

import { LOCALE_COOKIE_NAME, resolveLocale, type Locale } from "@/i18n/locales";
import { createTranslator, getCatalog, type Translator } from "@/i18n/translator";

/** The language chosen in Settings, or English when nothing is stored yet. */
export async function getLocale(): Promise<Locale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
}

/** Server components and Server Actions read their copy through this; pass `locale` where no request scope exists. */
export async function getTranslator(locale?: Locale): Promise<Translator> {
  const resolvedLocale = locale ?? (await getLocale());
  return createTranslator(resolvedLocale, getCatalog(resolvedLocale));
}
