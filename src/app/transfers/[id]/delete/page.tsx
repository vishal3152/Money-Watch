import { notFound } from "next/navigation";

import { BackLink } from "@/app/components/back-link";
import { DeleteConfirmForm } from "@/app/components/delete-confirm-form";
import { deleteTransfer } from "@/app/transfers/[id]/delete-actions";
import { getFixedDepositRepository, getTransferRepository } from "@/db/repository-factory";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type DeleteTransferPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DeleteTransferPage({ params }: DeleteTransferPageProps) {
  const { id } = await params;
  const { t } = await getTranslator();
  const transfer = await (await getTransferRepository()).getById(id);

  if (!transfer) {
    notFound();
  }

  // A Transfer has a FixedDeposit on at most one side (the other side is
  // always an Account) — see assertValidTransferPurpose in src/domain/transfer.ts.
  const relatedFixedDepositId = transfer.sourceFixedDepositId ?? transfer.destinationFixedDepositId;
  const relatedFixedDeposit = relatedFixedDepositId
    ? await (await getFixedDepositRepository()).getById(relatedFixedDepositId)
    : null;
  // Only a withdrawal (FixedDeposit on the source leg) can have closed the
  // FixedDeposit, and only if it's currently not Open — a partial withdrawal
  // that never closed it, or a top-up/opening-debit deletion, never reverts
  // status. Either leg's deletion does recompute principal, though.
  const mayRevertToOpen =
    transfer.sourceFixedDepositId !== null &&
    relatedFixedDeposit !== null &&
    relatedFixedDeposit.status !== "Open";

  return (
    <main className="pw-main">
      <section className="pw-card" aria-labelledby="delete-transfer-heading">
        <BackLink href={`/transfers/${id}`} label={t("transfers.backToTransfer")} />
        <h1 id="delete-transfer-heading">{t("transfers.delete.heading")}</h1>
        <p className="pw-detail-lede">
          {t("transfers.delete.warning")}
          {relatedFixedDeposit
            ? ` ${
                mayRevertToOpen
                  ? t("transfers.delete.recomputeMayReopen")
                  : t("transfers.delete.recompute")
              }`
            : null}
        </p>
        <DeleteConfirmForm
          action={deleteTransfer}
          hiddenFields={{ transferId: id }}
          confirmLabel={t("transfers.delete.confirm")}
        />
      </section>
    </main>
  );
}
