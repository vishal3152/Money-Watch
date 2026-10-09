import { notFound } from "next/navigation";

import { ShareTradingAccountEditForm } from "@/app/share-trading-accounts/[id]/edit/share-trading-account-edit-form";
import { BackLink } from "@/app/components/back-link";
import { getShareTradingAccountRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type EditShareTradingAccountPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditShareTradingAccountPage({ params }: EditShareTradingAccountPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const shareTradingAccount = await (await getShareTradingAccountRepository()).getById(id);

  if (!shareTradingAccount) {
    notFound();
  }

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="edit-share-trading-account-heading">
        <BackLink href={`/share-trading-accounts/${id}`} label={t("common.backTo", { name: shareTradingAccount.name })} />
        <h1 id="edit-share-trading-account-heading">
          {t("shareTrading.edit.heading", { name: shareTradingAccount.name })}
        </h1>
        <ShareTradingAccountEditForm shareTradingAccount={shareTradingAccount} />
      </section>
    </main>
  );
}
