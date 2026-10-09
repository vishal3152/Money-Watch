import { notFound } from "next/navigation";

import { deleteInstitution } from "@/app/institutions/[id]/delete-actions";
import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { getInstitutionRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteInstitutionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeleteInstitutionPage({ params }: DeleteInstitutionPageProps) {
  const { id } = await params;
  const { t, plural } = await getTranslator();
  const institutions = await getInstitutionRepository();
  // getDependentCounts() is keyed by `id` alone, not by the resolved
  // Institution, so it doesn't need to wait behind getById().
  const [institution, dependents] = await Promise.all([
    institutions.getById(id),
    institutions.getDependentCounts(id)
  ]);

  if (!institution) {
    notFound();
  }

  const blockingReasons: string[] = [];

  if (dependents.accounts > 0) {
    blockingReasons.push(plural("count.accounts", dependents.accounts));
  }
  if (dependents.fixedDeposits > 0) {
    blockingReasons.push(plural("count.fixedDeposits", dependents.fixedDeposits));
  }
  if (dependents.shareTradingAccounts > 0) {
    blockingReasons.push(
      plural("count.shareTradingAccounts", dependents.shareTradingAccounts)
    );
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-institution-heading">
        <BackLink href={`/institutions/${id}`} label={t("common.backTo", { name: institution.name })} />
        <h1 id="delete-institution-heading">
          {t("institutions.delete.heading", { name: institution.name })}
        </h1>
        {blockingReasons.length > 0 ? (
          <>
            <p className="pw-banner-error" role="alert">
              {t("institutions.delete.blocked", { reasons: blockingReasons.join(t("common.listSeparator")) })}
            </p>
            <p className="pw-detail-lede">{t("institutions.delete.blockedNote")}</p>
          </>
        ) : (
          <>
            <p className="pw-detail-lede">{t("institutions.delete.warning")}</p>
            <DeleteConfirmForm
              action={deleteInstitution}
              hiddenFields={{ institutionId: id }}
              confirmLabel={t("institutions.delete.confirm")}
            />
          </>
        )}
      </section>
    </main>
  );
}
