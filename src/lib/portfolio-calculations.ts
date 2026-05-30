import type { DashboardMetrics, Portfolio, Position, PositionAdjustment, Stock, StockTag, Trade, UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  fee_rate: 0.001425,
  tax_rate: 0.003,
  minimum_fee: 0,
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

export function resolveUnitPriceFromTotalAmount(input: {
  type: "buy" | "sell";
  quantity: number;
  totalAmount: number;
  settings: Pick<UserSettings, "fee_rate" | "tax_rate" | "minimum_fee">;
}) {
  if (input.quantity <= 0 || input.totalAmount <= 0) return 0;

  if (input.type === "sell") {
    return roundMoney(input.totalAmount / input.quantity);
  }

  let grossAmount = roundMoney(input.totalAmount);
  for (let index = 0; index < 6; index += 1) {
    const fee = calculateFee(grossAmount, input.settings);
    const nextGrossAmount = roundMoney(Math.max(input.totalAmount - fee, 0));
    if (Math.abs(nextGrossAmount - grossAmount) < 0.01) {
      grossAmount = nextGrossAmount;
      break;
    }
    grossAmount = nextGrossAmount;
  }

  return roundMoney(grossAmount / input.quantity);
}

export function compareTradesChronologically(a: Trade, b: Trade) {
  const dateDiff = new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime();
  if (dateDiff) return dateDiff;

  if (a.type !== b.type) return a.type === "buy" ? -1 : 1;

  const createdAtDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdAtDiff) return createdAtDiff;

  return a.id.localeCompare(b.id);
}

export function buildPositions(trades: Trade[], stocks: Stock[], stockTags: StockTag[] = [], positionAdjustments: PositionAdjustment[] = []): Position[] {
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]));
  const adjustmentsByKey = new Map(positionAdjustments.map((adjustment) => [`${adjustment.portfolio_id}:${adjustment.stock_id}`, adjustment]));
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
      remaining_principal: number;
      paid_fee: number;
      paid_tax: number;
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
        remaining_principal: 0,
        paid_fee: 0,
        paid_tax: 0,
        realized_profit: 0
      };

    if (trade.type === "buy") {
      draft.quantity = roundMoney(draft.quantity + trade.quantity);
      draft.remaining_cost = roundMoney(draft.remaining_cost + trade.net_amount);
      draft.remaining_principal = roundMoney(draft.remaining_principal + trade.gross_amount);
      draft.paid_fee = roundMoney(draft.paid_fee + trade.fee);
      draft.paid_tax = roundMoney(draft.paid_tax + trade.tax);
    } else {
      const averageCost = draft.quantity > 0 ? draft.remaining_cost / draft.quantity : 0;
      const averagePrincipal = draft.quantity > 0 ? draft.remaining_principal / draft.quantity : 0;
      const soldCost = roundMoney(averageCost * trade.quantity);
      const soldPrincipal = roundMoney(averagePrincipal * trade.quantity);
      draft.quantity = roundMoney(draft.quantity - trade.quantity);
      draft.remaining_cost = roundMoney(draft.remaining_cost - soldCost);
      draft.remaining_principal = roundMoney(draft.remaining_principal - soldPrincipal);
      draft.paid_fee = roundMoney(draft.paid_fee + trade.fee);
      draft.paid_tax = roundMoney(draft.paid_tax + trade.tax);
      draft.realized_profit = roundMoney(draft.realized_profit + trade.net_amount - soldCost);
    }

    drafts.set(key, draft);
  }

  for (const adjustment of positionAdjustments) {
    const key = `${adjustment.portfolio_id}:${adjustment.stock_id}`;
    if (drafts.has(key)) continue;
    drafts.set(key, {
      portfolio_id: adjustment.portfolio_id,
      stock_id: adjustment.stock_id,
      quantity: adjustment.adjusted_quantity,
      remaining_cost: adjustment.adjusted_cost,
      remaining_principal: adjustment.adjusted_cost,
      paid_fee: 0,
      paid_tax: 0,
      realized_profit: 0
    });
  }

  return [...drafts.values()]
    .filter((draft) => {
      const key = `${draft.portfolio_id}:${draft.stock_id}`;
      const adjustment = adjustmentsByKey.get(key);
      const quantity = adjustment ? adjustment.adjusted_quantity : draft.quantity;
      return quantity > 0 || draft.realized_profit !== 0;
    })
    .map((draft) => {
      const key = `${draft.portfolio_id}:${draft.stock_id}`;
      const adjustment = adjustmentsByKey.get(key);
      const stock = stocksById.get(draft.stock_id);
      const currentPrice = stock?.current_price ?? 0;
      const openQuantity = Math.max(roundMoney(adjustment?.adjusted_quantity ?? draft.quantity), 0);
      const openCost = Math.max(roundMoney(adjustment?.adjusted_cost ?? draft.remaining_cost), 0);
      const openPrincipal = Math.max(roundMoney(adjustment ? adjustment.adjusted_cost : draft.remaining_principal), 0);
      const marketValue = roundMoney(openQuantity * currentPrice);
      const unrealizedProfit = roundMoney(marketValue - openCost);
      const totalProfit = roundMoney(draft.realized_profit + unrealizedProfit);
      const averageCost = openQuantity > 0 ? roundMoney(openPrincipal / openQuantity) : 0;

      return {
        portfolio_id: draft.portfolio_id,
        stock_id: draft.stock_id,
        symbol: stock?.symbol ?? "",
        name: stock?.name ?? "",
        industry: stock?.industry || "未分類",
        tags: tagsByStockId.get(draft.stock_id) ?? [],
        quantity: openQuantity,
        holding_cost: openCost,
        average_cost: averageCost,
        remaining_cost: openCost,
        paid_fee: roundMoney(draft.paid_fee),
        paid_tax: roundMoney(draft.paid_tax),
        realized_profit: roundMoney(draft.realized_profit),
        current_price: currentPrice,
        price_updated_at: stock?.price_updated_at ?? null,
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
  // 持倉成本 = 目前仍持有部位的 remaining_cost / holding_cost 合計
  const holdingCost = roundMoney(positions.reduce((sum, position) => sum + position.holding_cost, 0));
  const holdingsValue = roundMoney(positions.reduce((sum, position) => sum + position.market_value, 0));
  const realizedProfit = roundMoney(positions.reduce((sum, position) => sum + position.realized_profit, 0));
  const unrealizedProfit = roundMoney(positions.reduce((sum, position) => sum + position.unrealized_profit, 0));
  // 總持股報酬 = 已實現損益 + 未實現損益
  const totalProfit = roundMoney(realizedProfit + unrealizedProfit);
  const totalDeposits = portfolios.reduce((sum, portfolio) => sum + portfolio.total_deposits, 0);

  return {
    cash,
    totalDeposits: roundMoney(totalDeposits),
    holdingCost,
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
