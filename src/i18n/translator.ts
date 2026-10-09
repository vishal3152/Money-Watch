import { LOCALE_TAGS, type Locale } from "@/i18n/locales";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { ar } from "@/i18n/messages/ar";

export type MessageKey = keyof typeof en;

/** Every locale must define exactly the English key set — a missing or stray
 * key is a type error, not a string that silently renders in the wrong language. */
export type Catalog = Record<MessageKey, string>;

type PluralBase<Key> = Key extends `${infer Base}.one` ? Base : never;

/** Keys usable with `plural()`: those authored as a `.one`/`.other` pair. */
export type PluralKey = PluralBase<MessageKey>;

export type MessageParams = Record<string, string | number>;

/**
 * A message chosen where the locale is not known — a Server Action's validation
 * error, say — and rendered later by whichever component holds the translator.
 */
export type LocalizedText = { key: MessageKey; params?: MessageParams };

export type Translator = {
  locale: Locale;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Picks the CLDR plural form for `count` and interpolates it as `{count}`. */
  plural: (key: PluralKey, count: number, params?: MessageParams) => string;
  text: (message: LocalizedText) => string;
};

const CATALOGS: Record<Locale, Catalog> = { en, zh, ar };

export function getCatalog(locale: Locale): Catalog {
  return CATALOGS[locale];
}

function interpolate(message: string, params: MessageParams | undefined): string {
  if (!params) {
    return message;
  }

  return message.replace(/\{([a-zA-Z]+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder
  );
}

export function createTranslator(
  locale: Locale,
  catalog: Readonly<Record<string, string>>
): Translator {
  const pluralRules = new Intl.PluralRules(LOCALE_TAGS[locale]);

  return {
    locale,
    t: (key, params) => interpolate(catalog[key], params),
    text: ({ key, params }) => interpolate(catalog[key], params),
    plural: (key, count, params) => {
      // Arabic selects zero/two/few/many too; the catalogs author one/other only.
      const category = pluralRules.select(count);
      const message = catalog[`${key}.${category}`] ?? catalog[`${key}.other`];
      return interpolate(message, { count, ...params });
    }
  };
}
