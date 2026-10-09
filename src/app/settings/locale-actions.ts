"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { LOCALE_COOKIE_NAME, isLocale } from "@/i18n/locales";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

type CookieOptions = { path: string; maxAge: number; sameSite: "lax" };

export type SetLocaleDeps = {
  setCookie?: (name: string, value: string, options: CookieOptions) => void;
  revalidate?: (path: string, type: "layout") => void;
};

async function requestCookieSetter(): Promise<NonNullable<SetLocaleDeps["setCookie"]>> {
  const cookieStore = await cookies();
  return (name, value, options) => cookieStore.set(name, value, options);
}

/**
 * Persists the language chosen in Settings. A Server Action is independently
 * callable, so the supported-locale check here is the actual enforcement —
 * not the three buttons the picker renders.
 */
export async function setLocale(locale: string, deps: SetLocaleDeps = {}): Promise<void> {
  if (!isLocale(locale)) {
    return;
  }

  const setCookie = deps.setCookie ?? (await requestCookieSetter());
  setCookie(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: ONE_YEAR_IN_SECONDS,
    sameSite: "lax"
  });

  // Every screen's copy comes from the layout's catalog, so nothing rendered is still correct.
  (deps.revalidate ?? revalidatePath)("/", "layout");
}
