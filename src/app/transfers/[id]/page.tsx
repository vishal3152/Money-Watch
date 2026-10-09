import Link from "next/link";
import { notFound } from "next/navigation";

import { BackToPreviousLink } from "@/app/components/back-to-previous-link";
import { resolveSystemMessage } from "@/app/components/system-message";
import { SystemMessageBanner } from "@/app/components/system-message-banner";
import { formatFixedDepositLabel, formatTransferPurpose } from "@/app/format-fixed-deposit";
import { DISPLAY_LOCALE, formatMinorUnits, formatRealizedFxRate } from "@/app/format-money";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getTransferRepository
} from "@/db/repository-factory";
import { realizedFxRate } from "@/domain/transfer";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type TransferDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
};

export default async function TransferDetailPage({ params, searchParams }: TransferDetailPageProps) {
  const { id } = await params;
  const { message } = await searchParams;
  const { t } = await getTranslator();
  const systemMessage = resolveSystemMessage(message, t);
  const transfer = await (await getTransferRepository()).getById(id);

  if (!transfer) {
    notFound();
  }

  const [accounts, fixedDeposits] = await Promise.all([
    getAccountRepository(),
    getFixedDepositRepository()
  ]);
  const [sourceAccount, sourceFixedDeposit, destinationAccount, destinationFixedDeposit] =
    await Promise.all([
      transfer.sourceAccountId ? accounts.getById(transfer.sourceAccountId) : null,
      transfer.sourceFixedDepositId
        ? fixedDeposits.getById(transfer.sourceFixedDepositId)
        : null,
      transfer.destinationAccountId ? accounts.getById(transfer.destinationAccountId) : null,
      transfer.destinationFixedDepositId
        ? fixedDeposits.getById(transfer.destinationFixedDepositId)
        : null
    ]);

  return (
    <main className="pw-main">
      <article className="pw-detail">
        <BackToPreviousLink label={t("transfers.detail.back")} />
        <h1>{transfer.description}</h1>
        <p className="pw-detail-lede">{new Date(transfer.occurredAt).toLocaleString(DISPLAY_LOCALE)}</p>
        {systemMessage ? <SystemMessageBanner message={systemMessage} /> : null}
        <dl className="pw-facts">
          <div>
            <dt>{t("transfers.detail.purpose")}</dt>
            <dd>{formatTransferPurpose(transfer.purpose, t)}</dd>
          </div>
          <div>
            <dt>{t("transfers.detail.source")}</dt>
            <dd>
              {sourceAccount ? (
                <Link href={`/accounts/${sourceAccount.id}`}>{sourceAccount.name}</Link>
              ) : sourceFixedDeposit ? (
                <Link href={`/fixed-deposits/${sourceFixedDeposit.id}`}>
                  {formatFixedDepositLabel(sourceFixedDeposit, t)}
                </Link>
              ) : (
                t("transfers.detail.unavailable")
              )}
              {" · "}
              {formatMinorUnits(transfer.sourceAmountMinor, transfer.sourceCurrencyCode)}
            </dd>
          </div>
          <div>
            <dt>{t("transfers.detail.destination")}</dt>
            <dd>
              {destinationAccount ? (
                <Link href={`/accounts/${destinationAccount.id}`}>
                  {destinationAccount.name}
                </Link>
              ) : destinationFixedDeposit ? (
                <Link href={`/fixed-deposits/${destinationFixedDeposit.id}`}>
                  {formatFixedDepositLabel(destinationFixedDeposit, t)}
                </Link>
              ) : (
                t("transfers.detail.unavailable")
              )}
              {" · "}
              {formatMinorUnits(
                transfer.destinationAmountMinor,
                transfer.destinationCurrencyCode
              )}
            </dd>
          </div>
          <div>
            <dt>{t("transfers.detail.realizedFxRate")}</dt>
            <dd>{formatRealizedFxRate(realizedFxRate(transfer))}</dd>
          </div>
        </dl>

        {transfer.purpose !== "fixed-deposit-opening" ? (
          <div className="pw-actions">
            <Link href={`/transfers/${id}/edit`}>{t("transfers.detail.edit")}</Link>
          </div>
        ) : null}

        <div className="pw-actions pw-danger-zone">
          <Link className="pw-danger-link" href={`/transfers/${id}/delete`}>
            {t("transfers.detail.delete")}
          </Link>
        </div>
      </article>
    </main>
  );
}
