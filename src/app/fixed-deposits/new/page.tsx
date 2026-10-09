import Link from "next/link";

import { FixedDepositForm } from "@/app/fixed-deposits/new/fixed-deposit-form";
import { BackLink } from "@/app/components/back-link";
import { getAccountRepository, getInstitutionRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type NewFixedDepositPageProps = {
  searchParams: Promise<{ institutionId?: string }>;
};

export default async function NewFixedDepositPage({ searchParams }: NewFixedDepositPageProps) {
  const { t } = await getTranslator();
  const [institutions, accounts] = await Promise.all([
    getInstitutionRepository().then((repo) => repo.listAll()),
    getAccountRepository().then((repo) => repo.listAll())
  ]);
  const { institutionId } = await searchParams;

  return (
    <main className="pw-main">
      {institutions.length === 0 || accounts.length === 0 ? (
        <section className="pw-card">
          <BackLink href="/" label={t("common.backToDashboard")} />
          <h1>{t("fixedDeposits.new.heading")}</h1>
          <p className="pw-empty">{t("fixedDeposits.new.needsAccount")}</p>
          <div className="pw-actions">
            {institutions.length === 0 ? (
              <Link className="pw-action-primary" href="/institutions/new">
                {t("dashboard.addInstitution")}
              </Link>
            ) : (
              <Link className="pw-action-primary" href="/accounts/new">
                {t("dashboard.addAccount")}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <FixedDepositForm
          institutions={institutions}
          accounts={accounts}
          initialInstitutionId={institutionId}
        />
      )}
    </main>
  );
}
