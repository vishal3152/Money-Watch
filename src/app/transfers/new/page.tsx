import Link from "next/link";

import { TransferForm } from "@/app/transfers/new/transfer-form";
import { BackLink } from "@/app/components/back-link";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getInstitutionRepository
} from "@/db/repository-factory";
import type { TransferPurpose } from "@/domain/transfer";
import { getTranslator } from "@/i18n/server";

export const dynamic = "force-dynamic";

type NewTransferPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTransferPage({ searchParams }: NewTransferPageProps) {
  const { t } = await getTranslator();
  const [accounts, fixedDeposits, institutions] = await Promise.all([
    getAccountRepository().then((repo) => repo.listAll()),
    getFixedDepositRepository().then((repo) => repo.listAll()),
    getInstitutionRepository().then((repo) => repo.listAll())
  ]);
  const query = await searchParams;
  const sourceAccountId = firstValue(query.sourceAccountId);
  const sourceFixedDepositId = firstValue(query.sourceFixedDepositId);
  const destinationAccountId = firstValue(query.destinationAccountId);
  const destinationFixedDepositId = firstValue(query.destinationFixedDepositId);
  const purposeParam = firstValue(query.purpose);

  const initialSourceType: "account" | "fixedDeposit" =
    sourceFixedDepositId && fixedDeposits.some((item) => item.id === sourceFixedDepositId)
      ? "fixedDeposit"
      : "account";
  const initialSourceId =
    initialSourceType === "fixedDeposit"
      ? sourceFixedDepositId ?? fixedDeposits[0]?.id ?? ""
      : sourceAccountId && accounts.some((item) => item.id === sourceAccountId)
        ? sourceAccountId
        : accounts[0]?.id ?? "";
  const forcedDestinationId =
    initialSourceType === "fixedDeposit"
      ? fixedDeposits.find((item) => item.id === initialSourceId)?.linkedAccountId ?? ""
      : null;
  const initialDestinationType: "account" | "fixedDeposit" =
    !forcedDestinationId &&
    destinationFixedDepositId &&
    fixedDeposits.some((item) => item.id === destinationFixedDepositId)
      ? "fixedDeposit"
      : "account";
  const initialDestinationId =
    forcedDestinationId ??
    (initialDestinationType === "account"
      ? destinationAccountId && accounts.some((item) => item.id === destinationAccountId)
        ? destinationAccountId
        : accounts[1]?.id ?? accounts[0]?.id ?? ""
      : destinationFixedDepositId &&
          fixedDeposits.some((item) => item.id === destinationFixedDepositId)
        ? destinationFixedDepositId
        : fixedDeposits[0]?.id ?? "");
  const initialPurpose: TransferPurpose | "" =
    purposeParam === "fixed-deposit-opening" ||
    purposeParam === "fixed-deposit-top-up" ||
    purposeParam === "fixed-deposit-withdrawal"
      ? purposeParam
      : "";

  return (
    <main className="pw-main">
      {accounts.length === 0 ? (
        <section className="pw-card">
          <BackLink href="/" label={t("common.backToDashboard")} />
          <h1>{t("transfers.new.heading")}</h1>
          <p className="pw-empty">{t("transfers.new.needsAccount")}</p>
          <div className="pw-actions">
            <Link className="pw-action-primary" href="/accounts/new">
              {t("dashboard.addAccount")}
            </Link>
          </div>
        </section>
      ) : (
        <TransferForm
          accounts={accounts}
          fixedDeposits={fixedDeposits}
          institutions={institutions}
          initialSourceType={initialSourceType}
          initialSourceId={initialSourceId}
          initialDestinationType={initialDestinationType}
          initialDestinationId={initialDestinationId}
          initialPurpose={initialPurpose}
        />
      )}
    </main>
  );
}
