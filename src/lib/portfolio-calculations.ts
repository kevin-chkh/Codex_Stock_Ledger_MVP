import type { DashboardMetrics, Portfolio, PortfolioStockOverride, Position, PositionAdjustment, Stock, StockTag, Trade, UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  fee_rate: 0.0012825,
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
  netAmountOverride?: number;
}) {
  const grossAmount = roundMoney(input.quantity * input.unitPrice);
  const fee = input.feeOverride ?? calculateFee(grossAmount, input.settings);
  const tax = input.taxOverride ?? calculateTax(grossAmount, input.type, input.settings);
  const calculatedNetAmount = input.type === "buy" ? roundMoney(grossAmount + fee) : roundMoney(grossAmount - fee - tax);
  const netAmount = input.netAmountOverride === undefined ? calculatedNetAmount : roundMoney(input.netAmountOverride);

  return { grossAmount, fee, tax, netAmount };
}

export function resolveUnitPriceFromTotalAmount(input: {
  type: "buy" | "sell";
  quantity: number;
  totalAmount: number;
  settings: Pick<UserSettings, "fee_rate" | "tax_rate" | "minimum_fee">;
  totalAmountIncludesFees?: boolean;
}) {
  if (input.quantity <= 0 || input.totalAmount <= 0) return 0;

  if (input.type === "sell") {
    if (!input.totalAmountIncludesFees) return roundMoney(input.totalAmount / input.quantity);

    let grossAmount = roundMoney(input.totalAmount);
    for (let index = 0; index < 8; index += 1) {
      const fee = calculateFee(grossAmount, input.settings);
      const tax = calculateTax(grossAmount, "sell", input.settings);
      const nextGrossAmount = roundMoney(input.totalAmount + fee + tax);
      if (Math.abs(nextGrossAmount - grossAmount) < 0.01) {
        grossAmount = nextGrossAmount;
        break;
      }
      grossAmount = nextGrossAmount;
    }

    return Math.round((grossAmount / input.quantity + Number.EPSILON) * 10000) / 10000;
  }

  if (!input.totalAmountIncludesFees) return roundMoney(input.totalAmount / input.quantity);

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

  return Math.round((grossAmount / input.quantity + Number.EPSILON) * 10000) / 10000;
}

export function compareTradesChronologically(a: Trade, b: Trade) {
  const dateDiff = new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime();
  if (dateDiff) return dateDiff;

  if (a.type !== b.type) return a.type === "buy" ? -1 : 1;

  const createdAtDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdAtDiff) return createdAtDiff;

  return a.id.localeCompare(b.id);
}

export function buildPositions(
  trades: Trade[],
  stocks: Stock[],
  stockTags: StockTag[] = [],
  positionAdjustments: PositionAdjustment[] = [],
  portfolioStockOverrides: PortfolioStockOverride[] = [],
  settings: Pick<UserSettings, "fee_rate" | "minimum_fee" | "tax_rate"> = DEFAULT_SETTINGS
): Position[] {
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]));
  const adjustmentsByKey = latestAdjustmentsByKey(positionAdjustments);
  const tagsByKey = stockTags.reduce<Map<string, string[]>>((map, tag) => {
    const key = `${tag.portfolio_id ?? "global"}:${tag.stock_id}`;
    const current = map.get(key) ?? [];
    current.push(tag.name);
    map.set(key, current);
    return map;
  }, new Map());
  const overridesByKey = latestOverridesByKey(portfolioStockOverrides);

  const sortedTrades = [...trades].sort(compareTradesChronologically);
  const tradesByKey = new Map<string, Trade[]>();
  const latestTradePriceByKey = new Map<string, number>();

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
    const currentTrades = tradesByKey.get(key) ?? [];
    currentTrades.push(trade);
    tradesByKey.set(key, currentTrades);
    latestTradePriceByKey.set(key, trade.unit_price);
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

  for (const adjustment of adjustmentsByKey.values()) {
    const key = `${adjustment.portfolio_id}:${adjustment.stock_id}`;
    const existingDraft =
      drafts.get(key) ??
      {
        portfolio_id: adjustment.portfolio_id,
        stock_id: adjustment.stock_id,
        quantity: 0,
        remaining_cost: 0,
        remaining_principal: 0,
        paid_fee: 0,
        paid_tax: 0,
        realized_profit: 0
      };

    const rebasedDraft = {
      ...existingDraft,
      quantity: adjustment.adjusted_quantity,
      remaining_cost: adjustment.adjusted_cost,
      remaining_principal: adjustment.adjusted_cost
    };

    const rebasedTrades = (tradesByKey.get(key) ?? []).filter((trade) => tradeFallsAfterAdjustmentBaseline(trade, adjustment));
    for (const trade of rebasedTrades) {
      applyTradeToOpenState(rebasedDraft, trade);
    }

    drafts.set(key, rebasedDraft);
  }

  return [...drafts.values()]
    .filter((draft) => {
      return draft.quantity > 0 || draft.realized_profit !== 0;
    })
    .map((draft) => {
      const stock = stocksById.get(draft.stock_id);
      const key = `${draft.portfolio_id}:${draft.stock_id}`;
      const openQuantity = Math.max(roundMoney(draft.quantity), 0);
      const openCost = Math.max(roundMoney(draft.remaining_cost), 0);
      const openPrincipal = Math.max(roundMoney(draft.remaining_principal), 0);
      const fallbackAveragePrice = openQuantity > 0 ? roundMoney(openPrincipal / openQuantity) : 0;
      const currentPrice =
        stock?.current_price && stock.current_price > 0
          ? stock.current_price
          : latestTradePriceByKey.get(key) ?? fallbackAveragePrice;
      const marketValue = roundMoney(openQuantity * currentPrice);
      const bookProfit = roundMoney(marketValue - openCost);
      const estimatedSellFee = openQuantity > 0 ? calculateFee(marketValue, settings) : 0;
      const estimatedSellTax = openQuantity > 0 ? calculateEstimatedSellTax(marketValue, stock, settings) : 0;
      const estimatedProfit = roundMoney(marketValue - estimatedSellFee - estimatedSellTax - openCost);
      const totalProfit = roundMoney(draft.realized_profit + estimatedProfit);
      const averageCost = openQuantity > 0 ? roundMoney(openPrincipal / openQuantity) : 0;

      return {
        portfolio_id: draft.portfolio_id,
        stock_id: draft.stock_id,
        symbol: stock?.symbol ?? "",
        name: stock?.name ?? "",
        industry: overridesByKey.get(`${draft.portfolio_id}:${draft.stock_id}`)?.industry_override || stock?.industry || "未分類",
        tags: tagsByKey.get(`${draft.portfolio_id}:${draft.stock_id}`) ?? tagsByKey.get(`global:${draft.stock_id}`) ?? [],
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
        book_profit: bookProfit,
        estimated_sell_fee: estimatedSellFee,
        estimated_sell_tax: estimatedSellTax,
        estimated_profit: estimatedProfit,
        estimated_return_rate: openCost > 0 ? estimatedProfit / openCost : 0,
        unrealized_profit: estimatedProfit,
        unrealized_return_rate: openCost > 0 ? estimatedProfit / openCost : 0,
        total_profit: totalProfit,
        total_return_rate: openCost > 0 ? totalProfit / openCost : 0
      };
    });
}

function calculateEstimatedSellTax(
  grossAmount: number,
  stock: Stock | undefined,
  settings: Pick<UserSettings, "tax_rate">
) {
  if (grossAmount <= 0) return 0;
  const taxRate = isTaiwanEtf(stock) ? 0.001 : settings.tax_rate;
  return roundMoney(grossAmount * taxRate);
}

function isTaiwanEtf(stock: Stock | undefined) {
  const symbol = stock?.symbol.trim() ?? "";
  const industry = stock?.industry?.trim().toUpperCase() ?? "";
  return industry.includes("ETF") || /^00\d+/.test(symbol);
}

function latestOverridesByKey(portfolioStockOverrides: PortfolioStockOverride[]) {
  const overridesByKey = new Map<string, PortfolioStockOverride>();

  for (const override of portfolioStockOverrides) {
    const key = `${override.portfolio_id}:${override.stock_id}`;
    const current = overridesByKey.get(key);
    if (!current || new Date(override.updated_at).getTime() >= new Date(current.updated_at).getTime()) {
      overridesByKey.set(key, override);
    }
  }

  return overridesByKey;
}

function latestAdjustmentsByKey(positionAdjustments: PositionAdjustment[]) {
  const adjustmentsByKey = new Map<string, PositionAdjustment>();

  for (const adjustment of positionAdjustments) {
    const key = `${adjustment.portfolio_id}:${adjustment.stock_id}`;
    const current = adjustmentsByKey.get(key);
    if (!current || new Date(adjustment.updated_at).getTime() >= new Date(current.updated_at).getTime()) {
      adjustmentsByKey.set(key, adjustment);
    }
  }

  return adjustmentsByKey;
}

function tradeCreatedAtMs(trade: Trade) {
  const createdAtMs = new Date(trade.created_at).getTime();
  if (Number.isFinite(createdAtMs)) return createdAtMs;
  return new Date(`${trade.traded_at}T23:59:59.999Z`).getTime();
}

function adjustmentUpdatedAtMs(adjustment: PositionAdjustment) {
  const updatedAtMs = new Date(adjustment.updated_at).getTime();
  if (Number.isFinite(updatedAtMs)) return updatedAtMs;
  const createdAtMs = new Date(adjustment.created_at).getTime();
  if (Number.isFinite(createdAtMs)) return createdAtMs;
  return Number.POSITIVE_INFINITY;
}

function adjustmentBaselineTradedAt(adjustment: PositionAdjustment) {
  return adjustment.baseline_traded_at || adjustment.created_at.slice(0, 10);
}

function adjustmentBaselineCreatedAtMs(adjustment: PositionAdjustment) {
  const baselineCreatedAtMs = new Date(adjustment.baseline_created_at ?? "").getTime();
  if (Number.isFinite(baselineCreatedAtMs)) return baselineCreatedAtMs;
  return adjustmentUpdatedAtMs(adjustment);
}

function tradeFallsAfterAdjustmentBaseline(trade: Trade, adjustment: PositionAdjustment) {
  const baselineTradeDate = adjustmentBaselineTradedAt(adjustment);
  if (trade.traded_at > baselineTradeDate) return true;
  if (trade.traded_at < baselineTradeDate) return false;
  return tradeCreatedAtMs(trade) > adjustmentBaselineCreatedAtMs(adjustment);
}

function applyTradeToOpenState(
  draft: {
    quantity: number;
    remaining_cost: number;
    remaining_principal: number;
  },
  trade: Trade
) {
  if (trade.type === "buy") {
    draft.quantity = roundMoney(draft.quantity + trade.quantity);
    draft.remaining_cost = roundMoney(draft.remaining_cost + trade.net_amount);
    draft.remaining_principal = roundMoney(draft.remaining_principal + trade.gross_amount);
    return;
  }

  const averageCost = draft.quantity > 0 ? draft.remaining_cost / draft.quantity : 0;
  const averagePrincipal = draft.quantity > 0 ? draft.remaining_principal / draft.quantity : 0;
  const soldCost = roundMoney(averageCost * trade.quantity);
  const soldPrincipal = roundMoney(averagePrincipal * trade.quantity);
  draft.quantity = roundMoney(draft.quantity - trade.quantity);
  draft.remaining_cost = roundMoney(draft.remaining_cost - soldCost);
  draft.remaining_principal = roundMoney(draft.remaining_principal - soldPrincipal);
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
  const openPositions = positions.filter((position) => position.quantity > 0);
  // 持倉成本 = 目前仍持有庫存的 holding_cost 合計；已賣光部位只保留已實現損益，不納入持倉成本。
  const holdingCost = roundMoney(openPositions.reduce((sum, position) => sum + position.holding_cost, 0));
  const holdingsValue = roundMoney(openPositions.reduce((sum, position) => sum + position.market_value, 0));
  const realizedProfit = roundMoney(positions.reduce((sum, position) => sum + position.realized_profit, 0));
  const estimatedProfit = roundMoney(openPositions.reduce((sum, position) => sum + position.estimated_profit, 0));
  // 總持股報酬 = 已實現損益 + 預估損益
  const totalProfit = roundMoney(realizedProfit + estimatedProfit);
  const totalDeposits = portfolios.reduce((sum, portfolio) => sum + portfolio.total_deposits, 0);

  return {
    cash,
    totalDeposits: roundMoney(totalDeposits),
    holdingCost,
    holdingsValue,
    totalAssets: roundMoney(cash + holdingsValue),
    realizedProfit,
    estimatedProfit,
    unrealizedProfit: estimatedProfit,
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
