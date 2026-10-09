import type { StockTransaction } from "@/domain/stock-transaction";

export type Holding = {
  scripCode: string;
  quantity: number;
};

export function computeHoldings(stockTransactions: readonly StockTransaction[]): Holding[] {
  const quantityByScripCode = new Map<string, number>();

  for (const stockTransaction of stockTransactions) {
    const signedQuantity = stockTransaction.type === "Buy" ? stockTransaction.quantity : -stockTransaction.quantity;
    const previousQuantity = quantityByScripCode.get(stockTransaction.scripCode) ?? 0;
    quantityByScripCode.set(stockTransaction.scripCode, previousQuantity + signedQuantity);
  }

  return Array.from(quantityByScripCode, ([scripCode, quantity]) => ({ scripCode, quantity }));
}
