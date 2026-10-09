"use client";

import { useActionState, useState, useTransition } from "react";

import { loadDemoSeedAction, type LoadDemoSeedState } from "@/app/dev/seed/actions";
import { BackLink } from "@/app/components/back-link";

const initialState: LoadDemoSeedState = {};

export function SeedLoaderForm() {
  const [state, formAction, actionPending] = useActionState(loadDemoSeedAction, initialState);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pending = actionPending || isPending;

  async function loadSeed() {
    setStatus("Fetching /demo-data/seed-data.json…");
    const response = await fetch("/demo-data/seed-data.json");
    if (!response.ok) {
      setStatus(
        `Could not fetch seed file (${response.status}). Run pnpm demo:generate first.`
      );
      return;
    }
    const seedJson = await response.text();
    setStatus("Loading into the database…");
    const formData = new FormData();
    formData.set("seedJson", seedJson);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div className="pw-card">
      <BackLink href="/" label="Back to Dashboard" />
      <h1>Load demo seed</h1>
      <p className="pw-detail-lede">
        Loads <code>public/demo-data/seed-data.json</code> into the current database: 10 banks,
        10 accounts each (5 INR / 3 USD / 2 AED), 1 Fixed Deposit per account, 6 Income/Expense
        Transactions and 6 Account→Account Transfers per account.
      </p>
      <p className="pw-detail-lede">
        Requires an empty (or non-conflicting) database. Generate the file with{" "}
        <code>pnpm demo:generate</code> if it is missing.
      </p>
      {status && !state.ok && !state.error ? <p className="pw-item-sub">{status}</p> : null}
      {state.error ? (
        <p className="pw-banner-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.result ? (
        <p role="status">
          Loaded {state.result.institutions} institutions, {state.result.accounts} accounts,{" "}
          {state.result.fixedDeposits} Fixed Deposits, {state.result.transactions} Transactions,{" "}
          {state.result.transfers} Transfers.
        </p>
      ) : null}
      <div className="pw-actions">
        <button className="pw-button" type="button" onClick={loadSeed} disabled={pending}>
          {pending ? "Loading…" : "Load seed data"}
        </button>
      </div>
    </div>
  );
}
