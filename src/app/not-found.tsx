import Link from "next/link";

import { getTranslator } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getTranslator();

  return (
    <main className="pw-main">
      <section className="pw-card">
        <h1>{t("notFound.heading")}</h1>
        <p className="pw-detail-lede">{t("notFound.lede")}</p>
        <div className="pw-actions">
          <Link href="/">{t("notFound.home")}</Link>
          <Link href="/institutions/new">{t("dashboard.addInstitution")}</Link>
        </div>
      </section>
    </main>
  );
}
