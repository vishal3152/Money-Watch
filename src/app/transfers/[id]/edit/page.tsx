import { notFound } from "next/navigation";

import { TransferForm } from "@/app/transfers/new/transfer-form";
import { toDatetimeLocalValue } from "@/app/datetime-local";
import { minorUnitsToDecimalString } from "@/app/format-money";
import {
  getAccountRepository,
  getFixedDepositRepository,
  getInstitutionRepository,
  getTransferRepository
} from "@/db/repository-factory";

export const dynamic = "force-dynamic";

type EditTransferPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTransferPage({ params }: EditTransferPageProps) {
  const { id } = await params;
  const transfer = await (await getTransferRepository()).getById(id);

  if (!transfer || transfer.purpose === "fixed-deposit-opening") {
    notFound();
  }

  const [accounts, fixedDeposits, institutions] = await Promise.all([
    getAccountRepository().then((repo) => repo.listAll()),
    getFixedDepositRepository().then((repo) => repo.listAll()),
    getInstitutionRepository().then((repo) => repo.listAll())
  ]);

  const sourceType: "account" | "fixedDeposit" = transfer.sourceFixedDepositId ? "fixedDeposit" : "account";
  const sourceId = transfer.sourceFixedDepositId ?? transfer.sourceAccountId ?? "";
  const destinationType: "account" | "fixedDeposit" = transfer.destinationFixedDepositId
    ? "fixedDeposit"
    : "account";
  const destinationId = transfer.destinationFixedDepositId ?? transfer.destinationAccountId ?? "";

  return (
    <main className="pw-main">
      <TransferForm
        accounts={accounts}
        fixedDeposits={fixedDeposits}
        institutions={institutions}
        initialSourceType={sourceType}
        initialSourceId={sourceId}
        initialDestinationType={destinationType}
        initialDestinationId={destinationId}
        initialPurpose={transfer.purpose}
        editing={{
          transferId: transfer.id,
          sourceAmount: minorUnitsToDecimalString(transfer.sourceAmountMinor, transfer.sourceCurrencyCode),
          destinationAmount: minorUnitsToDecimalString(
            transfer.destinationAmountMinor,
            transfer.destinationCurrencyCode
          ),
          description: transfer.description,
          occurredAt: toDatetimeLocalValue(new Date(transfer.occurredAt))
        }}
      />
    </main>
  );
}
