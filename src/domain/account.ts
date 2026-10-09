export type Account = {
  id: string;
  institutionId: string;
  name: string;
  /** Bank-assigned account number when known; optional. */
  accountNumber: string | null;
  currencyCode: string;
};
