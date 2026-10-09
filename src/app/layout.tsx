import type { ReactNode } from "react";
import { Inter, Inter_Tight } from "next/font/google";

import { AppHeader } from "@/app/components/app-header";
import { LocaleProvider } from "@/i18n/client";
import { LOCALE_TAGS, localeDirection } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { getCatalog } from "@/i18n/translator";

import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap"
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap"
});

export const metadata = {
  title: "Money Watch"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#387ed1"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const locale = await getLocale();

  return (
    <html
      lang={LOCALE_TAGS[locale]}
      dir={localeDirection(locale)}
      className={`${interTight.variable} ${inter.variable}`}
    >
      <body>
        <LocaleProvider locale={locale} catalog={getCatalog(locale)}>
          <div className="pw-shell">
            <AppHeader />
            {children}
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
