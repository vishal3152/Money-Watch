export type Reconciliation = {
  id: string;
  accountId: string;
  balanceSnapshotId: string;
  computedBalanceMinor: number;
  reconciledAt: string;
};
