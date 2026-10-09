export type DiscrepancyResolution = "corrected-my-record" | "disputed-with-bank";

export type Discrepancy = {
  id: string;
  reconciliationId: string;
  amountMinor: number;
  resolution: DiscrepancyResolution | null;
};
