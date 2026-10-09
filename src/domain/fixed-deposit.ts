export type FixedDepositStatus = "Open" | "Matured" | "PrematurelyClosed";

export type FixedDeposit = {
  id: string;
  name: string;
  /** Bank-assigned FixedDeposit / term-deposit number when known; optional. */
  accountNumber: string | null;
  institutionId: string;
  linkedAccountId: string;
  principalMinor: number;
  originalPrincipalMinor: number;
  currencyCode: string;
  interestRateBps: number;
  openedDate: string;
  maturityDate: string;
  status: FixedDepositStatus;
};
