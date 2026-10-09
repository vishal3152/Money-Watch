import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { deleteImportBatch, undoConfirmedImportBatch } from "@/app/imports/[id]/delete-actions";
import {
  getAccountRepository,
  getAdjustmentRepository,
  getBalanceSnapshotRepository,
  getImportBatchRepository,
  getReconciliationRepository
} from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translator";

export const dynamic = "force-dynamic";

type DeleteImportBatchPageProps = {
  params: Promise<{ id: string }>;
};

async function getConfirmedUndoBlockReason(batch: {
  accountId: string;
  asOfDate: string | null;
  reconciliationId: string | null;
}): Promise<MessageKey | null> {
  if (batch.reconciliationId !== null) {
    const reconciliationRepository = await getReconciliationRepository();
    const discrepancy = await reconciliationRepository.getDiscrepancyByReconciliationId(batch.reconciliationId);
    if (discrepancy) {
      const adjustment = await (await getAdjustmentRepository()).getByDiscrepancyId(discrepancy.id);
      if (adjustment) {
        return "imports.delete.blockedAdjustment";
      }
    }
  }

  if (batch.asOfDate !== null) {
    const snapshots = await (await getBalanceSnapshotRepository()).listByAccountId(batch.accountId);
    if (snapshots.some((snapshot) => snapshot.asOfDate > batch.asOfDate!)) {
      return "imports.delete.blockedLaterReconciliation";
    }
  }

  return null;
}

export default async function DeleteImportBatchPage({ params }: DeleteImportBatchPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const batch = await (await getImportBatchRepository()).getById(id);

  if (!batch) {
    notFound();
  }

  const account = await (await getAccountRepository()).getById(batch.accountId);
  const confirmedUndoBlockReason =
    batch.confirmedAt !== null ? await getConfirmedUndoBlockReason(batch) : null;

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-import-batch-heading">
        <BackLink href={`/imports/${id}`} label={t("imports.backToImport")} />
        <h1 id="delete-import-batch-heading">{t("imports.delete.heading")}</h1>
        {batch.confirmedAt !== null ? (
          confirmedUndoBlockReason !== null ? (
            <>
              <p className="pw-banner-error" role="alert">
                {t(confirmedUndoBlockReason)}
              </p>
              <p className="pw-detail-lede">{t("imports.delete.blockedNote")}</p>
            </>
          ) : (
            <>
              <p className="pw-detail-lede">
                {account
                  ? t("imports.delete.undoConfirmedWarning", { account: account.name })
                  : t("imports.delete.undoConfirmedWarningNoAccount")}
              </p>
              <DeleteConfirmForm
                action={undoConfirmedImportBatch}
                hiddenFields={{ batchId: id }}
                confirmLabel={t("imports.undo")}
              />
            </>
          )
        ) : (
          <>
            <p className="pw-detail-lede">
              {account
                ? t("imports.delete.deleteWarning", { account: account.name })
                : t("imports.delete.deleteWarningNoAccount")}
            </p>
            <DeleteConfirmForm
              action={deleteImportBatch}
              hiddenFields={{ batchId: id }}
              confirmLabel={t("imports.delete.confirm")}
            />
          </>
        )}
      </section>
    </main>
  );
}
