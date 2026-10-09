import Link from "next/link";

import { AccountForm } from "@/app/accounts/new/account-form";
import { BackLink } from "@/app/components/back-link";
import { getInstitutionRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type NewAccountPageProps = {
  searchParams: Promise<{ institutionId?: string }>;
};

export default async function NewAccountPage({ searchParams }: NewAccountPageProps) {
  const { t } = await getTranslator();
  const institutions = await (await getInstitutionRepository()).listAll();
  const { institutionId } = await searchParams;

  return (
    <main className="pw-main">
      {institutions.length === 0 ? (
        <section className="pw-card">
          <BackLink href="/" label={t("common.backToDashboard")} />
          <h1>{t("accounts.new.heading")}</h1>
          <p className="pw-empty">{t("accounts.new.needsInstitution")}</p>
          <div className="pw-actions">
            <Link className="pw-action-primary" href="/institutions/new">
              {t("dashboard.addInstitution")}
            </Link>
          </div>
        </section>
      ) : (
        <AccountForm institutions={institutions} initialInstitutionId={institutionId} />
      )}
    </main>
  );
}
