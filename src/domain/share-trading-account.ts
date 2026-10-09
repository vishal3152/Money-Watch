export type ShareTradingAccount = {
  id: string;
  institutionId: string;
  name: string;
  /** Broker-assigned account number when known; optional. */
  accountNumber: string | null;
  currencyCode: string;
};
