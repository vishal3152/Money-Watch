import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { deleteStockImportBatch } from "@/app/stock-imports/[id]/delete-actions";
import { getShareTradingAccountRepository, getStockImportBatchRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteStockImportBatchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeleteStockImportBatchPage({ params }: DeleteStockImportBatchPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const batch = await (await getStockImportBatchRepository()).getById(id);

  if (!batch) {
    notFound();
  }

  const shareTradingAccount = await (await getShareTradingAccountRepository()).getById(batch.shareTradingAccountId);

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-stock-import-batch-heading">
        <BackLink href={`/stock-imports/${id}`} label={t("stockImports.backToStockImport")} />
        <h1 id="delete-stock-import-batch-heading">{t("stockImports.delete.heading")}</h1>
        {batch.confirmedAt !== null ? (
          <>
            <p className="pw-banner-error" role="alert">
              {t("stockImports.delete.alreadyConfirmed")}
            </p>
            <p className="pw-detail-lede">{t("stockImports.delete.blockedNote")}</p>
          </>
        ) : (
          <>
            <p className="pw-detail-lede">
              {shareTradingAccount
                ? t("stockImports.delete.warning", { account: shareTradingAccount.name })
                : t("stockImports.delete.warningNoAccount")}
            </p>
            <DeleteConfirmForm
              action={deleteStockImportBatch}
              hiddenFields={{ batchId: id }}
              confirmLabel={t("imports.delete.confirm")}
            />
          </>
        )}
      </section>
    </main>
  );
}
