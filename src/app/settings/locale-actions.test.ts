import { describe, expect, it, vi } from "vitest";

import { setLocale } from "@/app/settings/locale-actions";
import { LOCALE_COOKIE_NAME } from "@/i18n/locales";

function deps() {
  return { setCookie: vi.fn(), revalidate: vi.fn() };
}

describe("setLocale", () => {
  it("stores a supported locale in the language cookie", async () => {
    const stub = deps();

    await setLocale("ar", stub);

    expect(stub.setCookie).toHaveBeenCalledWith(
      LOCALE_COOKIE_NAME,
      "ar",
      expect.objectContaining({ path: "/", sameSite: "lax" })
    );
  });

  it("keeps the choice for a year so it survives a browser restart", async () => {
    const stub = deps();

    await setLocale("zh", stub);

    const [, , options] = stub.setCookie.mock.calls[0];
    expect(options.maxAge).toBe(60 * 60 * 24 * 365);
  });

  it("revalidates the whole layout so every rendered screen switches language", async () => {
    const stub = deps();

    await setLocale("zh", stub);

    expect(stub.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("ignores an unsupported value rather than writing it to the cookie", async () => {
    const stub = deps();

    await setLocale("fr", stub);

    expect(stub.setCookie).not.toHaveBeenCalled();
    expect(stub.revalidate).not.toHaveBeenCalled();
  });
});
