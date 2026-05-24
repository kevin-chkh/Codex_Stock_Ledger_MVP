import type { DashboardMetrics, Portfolio, Position, Stock, StockTag, Trade, UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  fee_rate: 0.001425,
  tax_rate: 0.003,
  minimum_fee: 20,
  allow_negative_cash: false
};

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFee(grossAmount: number, settings: Pick<UserSettings, "fee_rate" | "minimum_fee">) {
  if (grossAmount <= 0) return 0;
  return roundMoney(Math.max(grossAmount * settings.fee_rate, settings.minimum_fee));
}

export function calculateTax(grossAmount: number, type: "buy" | "sell", settings: Pick<UserSettings, "tax_rate">) {
  return type === "sell" ? roundMoney(grossAmount * settings.tax_rate) : 0;
}

export function calculateTradeAmounts(input: {
  type: "buy" | "sell";
  quantity: number;
  unitPrice: number;
  settings: Pick<UserSettings, "fee_rate" | "tax_rate" | "minimum_fee">;
  feeOverride?: number;
  taxOverride?: number;
}) {
  const grossAmount = roundMoney(input.quantity * input.unitPrice);
  const fee = input.feeOverride ?? calculateFee(grossAmount, input.settings);
  const tax = input.taxOverride ?? calculateTax(grossAmount, input.type, input.settings);
  const netAmount = input.type === "buy" ? roundMoney(grossAmount + fee) : roundMoney(grossAmount - fee - tax);

  return { grossAmount, fee, tax, netAmount };
}

export function compareTradesChronologically(a: Trade, b: Trade) {
  const dateDiff = new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime();
  if (dateDiff) return dateDiff;

  if (a.type !== b.type) return a.type === "buy" ? -1 : 1;

  const createdAtDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdAtDiff) return createdAtDiff;

  return a.id.localeCompare(b.id);
}

export function buildPositions(trades: Trade[], stocks: Stock[], stockTags: StockTag[] = []): Position[] {
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]));
  const tagsByStockId = stockTags.reduce<Map<string, string[]>>((map, tag) => {
    const current = map.get(tag.stock_id) ?? [];
    current.push(tag.name);
    map.set(tag.stock_id, current);
    return map;
  }, new Map());

  const sortedTrades = [...trades].sort(compareTradesChronologically);

  const drafts = new Map<
    string,
    {
      portfolio_id: string;
      stock_id: string;
      quantity: number;
      remaining_cost: number;
      realized_profit: number;
    }
  >();

  for (const trade of sortedTrades) {
    const key = `${trade.portfolio_id}:${trade.stock_id}`;
    const draft =
      drafts.get(key) ??
      {
        portfolio_id: trade.portfolio_id,
        stock_id: trade.stock_id,
        quantity: 0,
        remaining_cost: 0,
        realized_profit: 0
      };

    if (trade.type === "buy") {
      draft.quantity = roundMoney(draft.quantity + trade.quantity);
      draft.remaining_cost = roundMoney(draft.remaining_cost + trade.net_amount);
    } else {
      const averageCost = draft.quantity > 0 ? draft.remaining_cost / draft.quantity : 0;
      const soldCost = roundMoney(averageCost * trade.quantity);
      draft.quantity = roundMoney(draft.quantity - trade.quantity);
      draft.remaining_cost = roundMoney(draft.remaining_cost - soldCost);
      draft.realized_profit = roundMoney(draft.realized_profit + trade.net_amount - soldCost);
    }

    drafts.set(key, draft);
  }

  return [...drafts.values()]
    .filter((draft) => draft.quantity > 0 || draft.realized_profit !== 0)
    .map((draft) => {
      const stock = stocksById.get(draft.stock_id);
      const currentPrice = stock?.current_price ?? 0;
      const openQuantity = Math.max(draft.quantity, 0);
      const openCost = Math.max(roundMoney(draft.remaining_cost), 0);
      const marketValue = roundMoney(openQuantity * currentPrice);
      const unrealizedProfit = roundMoney(marketValue - openCost);
      const totalProfit = roundMoney(draft.realized_profit + unrealizedProfit);
      const averageCost = openQuantity > 0 ? roundMoney(openCost / openQuantity) : 0;

      return {
        portfolio_id: draft.portfolio_id,
        stock_id: draft.stock_id,
        symbol: stock?.symbol ?? "",
        name: stock?.name ?? "",
        industry: stock?.industry || "未分類",
        tags: tagsByStockId.get(draft.stock_id) ?? [],
        quantity: openQuantity,
        average_cost: averageCost,
        remaining_cost: openCost,
        realized_profit: roundMoney(draft.realized_profit),
        current_price: currentPrice,
        market_value: marketValue,
        unrealized_profit: unrealizedProfit,
        unrealized_return_rate: openCost > 0 ? unrealizedProfit / openCost : 0,
        total_profit: totalProfit,
        total_return_rate: openCost > 0 ? totalProfit / openCost : 0
      };
    });
}

export function validateSellQuantity(trades: Trade[], stockId: string, portfolioId: string, sellQuantity: number) {
  const currentPosition = buildPositions(
    trades.filter((trade) => trade.portfolio_id === portfolioId && trade.stock_id === stockId),
    []
  )[0];
  const available = currentPosition?.quantity ?? 0;

  return {
    available,
    valid: sellQuantity <= available
  };
}

export function calculateDashboardMetrics(portfolios: Portfolio[], positions: Position[]): DashboardMetrics {
  const cash = roundMoney(portfolios.reduce((sum, portfolio) => sum + portfolio.cash_balance, 0));
  const holdingsValue = roundMoney(positions.reduce((sum, position) => sum + position.market_value, 0));
  const realizedProfit = roundMoney(positions.reduce((sum, position) => sum + position.realized_profit, 0));
  const unrealizedProfit = roundMoney(positions.reduce((sum, position) => sum + position.unrealized_profit, 0));
  const totalProfit = roundMoney(realizedProfit + unrealizedProfit);
  const totalDeposits = portfolios.reduce((sum, portfolio) => sum + portfolio.total_deposits, 0);

  return {
    cash,
    holdingsValue,
    totalAssets: roundMoney(cash + holdingsValue),
    realizedProfit,
    unrealizedProfit,
    totalProfit,
    totalReturnRate: totalDeposits > 0 ? totalProfit / totalDeposits : 0
  };
}

export function groupByValue<T>(items: T[], getName: (item: T) => string, getValue: (item: T) => number) {
  const grouped = items.reduce<Map<string, number>>((map, item) => {
    const name = getName(item) || "未分類";
    map.set(name, roundMoney((map.get(name) ?? 0) + getValue(item)));
    return map;
  }, new Map());

  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}
