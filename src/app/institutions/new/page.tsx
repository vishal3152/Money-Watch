import { BackLink } from "@/app/components/back-link";
import { InstitutionForm } from "@/app/institutions/new/institution-form";
import { getTranslator } from "@/i18n/server";

export default async function NewInstitutionPage() {
  const { t } = await getTranslator();

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="add-institution-heading">
        <BackLink href="/" label={t("common.backToDashboard")} />
        <h1 id="add-institution-heading">{t("institutions.new.heading")}</h1>
        <InstitutionForm />
      </section>
    </main>
  );
}
