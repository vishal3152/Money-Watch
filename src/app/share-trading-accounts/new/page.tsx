import Link from "next/link";

import { BackLink } from "@/app/components/back-link";
import { ShareTradingAccountForm } from "@/app/share-trading-accounts/new/share-trading-account-form";
import { getInstitutionRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type NewShareTradingAccountPageProps = {
  searchParams: Promise<{ institutionId?: string }>;
};

export default async function NewShareTradingAccountPage({ searchParams }: NewShareTradingAccountPageProps) {
  const { t } = await getTranslator();
  const institutions = await (await getInstitutionRepository()).listAll();
  const { institutionId } = await searchParams;

  return (
    <main className="pw-main">
      {institutions.length === 0 ? (
        <section className="pw-card">
          <BackLink href="/" label={t("common.backToDashboard")} />
          <h1>{t("shareTrading.new.heading")}</h1>
          <p className="pw-empty">{t("shareTrading.new.needsInstitution")}</p>
          <div className="pw-actions">
            <Link className="pw-action-primary" href="/institutions/new">
              {t("dashboard.addInstitution")}
            </Link>
          </div>
        </section>
      ) : (
        <ShareTradingAccountForm institutions={institutions} initialInstitutionId={institutionId} />
      )}
    </main>
  );
}
