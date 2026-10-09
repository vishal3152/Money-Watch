import { notFound } from "next/navigation";

import { AccountEditForm } from "@/app/accounts/[id]/edit/account-edit-form";
import { BackLink } from "@/app/components/back-link";
import { getAccountRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type EditAccountPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAccountPage({ params }: EditAccountPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const account = await (await getAccountRepository()).getById(id);

  if (!account) {
    notFound();
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="edit-account-heading">
        <BackLink href={`/accounts/${id}`} label={t("common.backTo", { name: account.name })} />
        <h1 id="edit-account-heading">{t("accounts.edit.heading", { name: account.name })}</h1>
        <AccountEditForm account={account} />
      </section>
    </main>
  );
}
