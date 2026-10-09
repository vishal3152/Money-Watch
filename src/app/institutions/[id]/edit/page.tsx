import { notFound } from "next/navigation";

import { InstitutionEditForm } from "@/app/institutions/[id]/edit/institution-edit-form";
import { BackLink } from "@/app/components/back-link";
import { getInstitutionRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type EditInstitutionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInstitutionPage({ params }: EditInstitutionPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const institutions = await getInstitutionRepository();
  const institution = await institutions.getById(id);

  if (!institution) {
    notFound();
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="edit-institution-heading">
        <BackLink href={`/institutions/${id}`} label={t("common.backTo", { name: institution.name })} />
        <h1 id="edit-institution-heading">{t("institutions.edit.heading", { name: institution.name })}</h1>
        <InstitutionEditForm institution={institution} />
      </section>
    </main>
  );
}
