import { calculateTradeAmounts, compareTradesChronologically } from "./calculations";
import type { Portfolio, Trade, TradeType, UserSettings } from "./types";

export function makeTrade(input: {
  id: string;
  userId: string;
  portfolioId: string;
  stockId: string;
  type: TradeType;
  quantity: number;
  unitPrice: number;
  settings: UserSettings;
  tradedAt: string;
  createdAt: string;
  note?: string | null;
}): Trade {
  const amounts = calculateTradeAmounts({
    type: input.type,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    settings: input.settings
  });

  return {
    id: input.id,
    user_id: input.userId,
    portfolio_id: input.portfolioId,
    stock_id: input.stockId,
    type: input.type,
    traded_at: input.tradedAt,
    quantity: input.quantity,
    unit_price: input.unitPrice,
    gross_amount: amounts.grossAmount,
    fee: amounts.fee,
    tax: amounts.tax,
    net_amount: amounts.netAmount,
    note: input.note || null,
    created_at: input.createdAt
  };
}

export function tradeCashImpact(trade: Trade) {
  return trade.type === "buy" ? -trade.net_amount : trade.net_amount;
}

export function buildPortfolioUpdates(portfolios: Portfolio[], oldTrade: Trade | null, nextTrade: Trade, updatedAt: string) {
  const updates = new Map<string, Portfolio>();
  const applyDelta = (portfolioId: string, delta: number) => {
    const base = updates.get(portfolioId) ?? portfolios.find((portfolio) => portfolio.id === portfolioId);
    if (!base) return;
    updates.set(portfolioId, {
      ...base,
      cash_balance: base.cash_balance + delta,
      updated_at: updatedAt
    });
  };

  if (oldTrade) applyDelta(oldTrade.portfolio_id, -tradeCashImpact(oldTrade));
  applyDelta(nextTrade.portfolio_id, tradeCashImpact(nextTrade));

  return [...updates.values()];
}

export function applyTradeToPortfolios(portfolios: Portfolio[], oldTrade: Trade | null, nextTrade: Trade, updatedAt: string) {
  const updates = buildPortfolioUpdates(portfolios, oldTrade, nextTrade, updatedAt);
  return portfolios.map((portfolio) => updates.find((updated) => updated.id === portfolio.id) ?? portfolio);
}

export function deleteTradeFromPortfolios(portfolios: Portfolio[], trade: Trade, updatedAt: string) {
  return portfolios.map((portfolio) =>
    portfolio.id === trade.portfolio_id
      ? {
          ...portfolio,
          cash_balance: portfolio.cash_balance - tradeCashImpact(trade),
          updated_at: updatedAt
        }
      : portfolio
  );
}

export function hasOversoldPosition(trades: Trade[], scope?: { portfolioId: string; stockId: string }) {
  const quantities = new Map<string, number>();
  const scopedTrades = scope
    ? trades.filter((trade) => trade.portfolio_id === scope.portfolioId && trade.stock_id === scope.stockId)
    : trades;
  const sortedTrades = [...scopedTrades].sort(compareTradesChronologically);

  for (const trade of sortedTrades) {
    const key = trade.portfolio_id + ":" + trade.stock_id;
    const current = quantities.get(key) ?? 0;
    const nextQuantity = trade.type === "buy" ? current + trade.quantity : current - trade.quantity;
    if (nextQuantity < 0) return true;
    quantities.set(key, nextQuantity);
  }

  return false;
}
