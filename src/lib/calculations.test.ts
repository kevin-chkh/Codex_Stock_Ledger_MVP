import { describe, expect, it } from "vitest";
import {
  buildPositions,
  calculateDashboardMetrics,
  calculateTradeAmounts,
  compareTradesChronologically,
  DEFAULT_SETTINGS,
  resolveUnitPriceFromTotalAmount,
  validateSellQuantity
} from "./calculations";
import type { Portfolio, PortfolioStockOverride, PositionAdjustment, Stock, StockTag, Trade } from "./types";

const stock: Stock = {
  id: "stock-1",
  user_id: "user-1",
  symbol: "2330",
  name: "台積電",
  market: "TWSE",
  industry: "半導體業",
  current_price: 110,
  price_updated_at: null,
  created_at: "",
  updated_at: ""
};

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: overrides.id ?? "trade-1",
    user_id: "user-1",
    portfolio_id: "portfolio-1",
    stock_id: "stock-1",
    type: "buy",
    traded_at: "2026-01-01",
    quantity: 100,
    unit_price: 100,
    gross_amount: 10000,
    fee: 20,
    tax: 0,
    net_amount: 10020,
    note: null,
    created_at: "",
    ...overrides
  };
}

describe("calculateTradeAmounts", () => {
  it("calculates buy total cost with minimum fee", () => {
    expect(calculateTradeAmounts({ type: "buy", quantity: 100, unitPrice: 100, settings: DEFAULT_SETTINGS })).toEqual({
      grossAmount: 10000,
      fee: 12.83,
      tax: 0,
      netAmount: 10012.83
    });
  });

  it("calculates sell net amount with tax", () => {
    expect(calculateTradeAmounts({ type: "sell", quantity: 100, unitPrice: 100, settings: DEFAULT_SETTINGS })).toEqual({
      grossAmount: 10000,
      fee: 12.83,
      tax: 30,
      netAmount: 9957.17
    });
  });

  it("allows manual fee and tax overrides", () => {
    expect(
      calculateTradeAmounts({
        type: "sell",
        quantity: 100,
        unitPrice: 100,
        settings: DEFAULT_SETTINGS,
        feeOverride: 15,
        taxOverride: 25
      })
    ).toEqual({
      grossAmount: 10000,
      fee: 15,
      tax: 25,
      netAmount: 9960
    });
  });

  it("preserves entered net amount when sell total already includes fee and tax", () => {
    expect(
      calculateTradeAmounts({
        type: "sell",
        quantity: 2000,
        unitPrice: 13.44,
        settings: DEFAULT_SETTINGS,
        netAmountOverride: 26756
      })
    ).toEqual({
      grossAmount: 26880,
      fee: 34.47,
      tax: 80.64,
      netAmount: 26756
    });
  });

  it("derives buy unit price from total amount including fee", () => {
    expect(
      resolveUnitPriceFromTotalAmount({
        type: "buy",
        quantity: 100,
        totalAmount: 10012.83,
        settings: DEFAULT_SETTINGS,
        totalAmountIncludesFees: true
      })
    ).toBe(100);
  });

  it("keeps buy total amount mode as gross amount when fee is not included", () => {
    expect(
      resolveUnitPriceFromTotalAmount({
        type: "buy",
        quantity: 100,
        totalAmount: 10000,
        settings: DEFAULT_SETTINGS
      })
    ).toBe(100);
  });

  it("keeps sell total amount mode as gross amount", () => {
    expect(
      resolveUnitPriceFromTotalAmount({
        type: "sell",
        quantity: 100,
        totalAmount: 10000,
        settings: DEFAULT_SETTINGS
      })
    ).toBe(100);
  });

  it("derives sell unit price from net amount when total includes fee and tax", () => {
    expect(
      resolveUnitPriceFromTotalAmount({
        type: "sell",
        quantity: 4,
        totalAmount: 13263,
        settings: DEFAULT_SETTINGS,
        totalAmountIncludesFees: true
      })
    ).toBeCloseTo(3330, 1);
  });
});

describe("compareTradesChronologically", () => {
  it("keeps same-day buys before sells and preserves created_at ordering", () => {
    const rows = [
      trade({ id: "sell-late", type: "sell", traded_at: "2026-01-02", created_at: "2026-01-02T09:00:00.000Z" }),
      trade({ id: "buy-early", type: "buy", traded_at: "2026-01-02", created_at: "2026-01-02T08:00:00.000Z" }),
      trade({ id: "older-day", type: "buy", traded_at: "2026-01-01", created_at: "2026-01-01T10:00:00.000Z" }),
      trade({ id: "buy-late", type: "buy", traded_at: "2026-01-02", created_at: "2026-01-02T10:00:00.000Z" })
    ];

    const sorted = [...rows].sort(compareTradesChronologically);

    expect(sorted.map((item) => item.id)).toEqual(["older-day", "buy-early", "buy-late", "sell-late"]);
  });
});

describe("buildPositions", () => {
  it("uses average cost and realizes profit on sell", () => {
    const positions = buildPositions(
      [
        trade({ id: "1", type: "buy", quantity: 100, unit_price: 100, net_amount: 10020 }),
        trade({ id: "2", type: "buy", quantity: 100, unit_price: 120, gross_amount: 12000, fee: 20, net_amount: 12020, traded_at: "2026-01-02" }),
        trade({ id: "3", type: "sell", quantity: 50, unit_price: 130, gross_amount: 6500, fee: 20, tax: 19.5, net_amount: 6460.5, traded_at: "2026-01-03" })
      ],
      [stock]
    );

    expect(positions[0].quantity).toBe(150);
    expect(positions[0].holding_cost).toBe(16530);
    expect(positions[0].average_cost).toBe(110);
    expect(positions[0].paid_fee).toBe(60);
    expect(positions[0].paid_tax).toBe(19.5);
    expect(positions[0].realized_profit).toBe(950.5);
    expect(positions[0].book_profit).toBe(-30);
    expect(positions[0].estimated_sell_fee).toBe(21.16);
    expect(positions[0].estimated_sell_tax).toBe(49.5);
    expect(positions[0].estimated_profit).toBe(-100.66);
    expect(positions[0].unrealized_profit).toBe(-100.66);
    expect(positions[0].price_updated_at).toBeNull();
  });

  it("falls back to the latest trade price when current price is missing", () => {
    const positions = buildPositions(
      [
        trade({ id: "1", type: "buy", quantity: 100, unit_price: 100, gross_amount: 10000, fee: 20, net_amount: 10020 }),
        trade({ id: "2", type: "sell", quantity: 50, unit_price: 130, gross_amount: 6500, fee: 20, tax: 19.5, net_amount: 6460.5, traded_at: "2026-01-02" })
      ],
      [{ ...stock, current_price: 0 }]
    );

    expect(positions[0].quantity).toBe(50);
    expect(positions[0].current_price).toBe(130);
    expect(positions[0].market_value).toBe(6500);
    expect(positions[0].unrealized_return_rate).toBeGreaterThan(-1);
  });

  it("applies position adjustments to open quantity and cost", () => {
    const adjustments: PositionAdjustment[] = [
      {
        id: "adj-1",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        adjusted_quantity: 80,
        adjusted_cost: 8640,
        baseline_traded_at: "2026-01-02",
        baseline_created_at: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z"
      }
    ];

    const positions = buildPositions([trade({ quantity: 100, net_amount: 10014.25 })], [stock], [], adjustments);

    expect(positions[0].quantity).toBe(80);
    expect(positions[0].holding_cost).toBe(8640);
    expect(positions[0].remaining_cost).toBe(8640);
    expect(positions[0].average_cost).toBe(108);
  });

  it("uses the latest position adjustment when duplicate adjustment rows exist", () => {
    const adjustments: PositionAdjustment[] = [
      {
        id: "adj-old",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        adjusted_quantity: 80,
        adjusted_cost: 8640,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "adj-new",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        adjusted_quantity: 60,
        adjusted_cost: 7200,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z"
      }
    ];

    const positions = buildPositions([trade({ quantity: 100, net_amount: 10012.83 })], [stock], [], adjustments);

    expect(positions[0].quantity).toBe(60);
    expect(positions[0].holding_cost).toBe(7200);
  });

  it("treats position adjustment as baseline and applies later trades on top", () => {
    const adjustments: PositionAdjustment[] = [
      {
        id: "adj-1",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        adjusted_quantity: 80,
        adjusted_cost: 8640,
        created_at: "2026-01-02T10:00:00.000Z",
        updated_at: "2026-01-02T10:00:00.000Z"
      }
    ];

    const positions = buildPositions(
      [
        trade({ id: "buy-old", quantity: 100, gross_amount: 10000, fee: 12.83, net_amount: 10012.83, created_at: "2026-01-01T09:00:00.000Z" }),
        trade({ id: "buy-new", traded_at: "2026-01-03", quantity: 20, gross_amount: 2400, fee: 12.83, net_amount: 2412.83, created_at: "2026-01-03T09:00:00.000Z" })
      ],
      [stock],
      [],
      adjustments
    );

    expect(positions[0].quantity).toBe(100);
    expect(positions[0].holding_cost).toBe(11052.83);
    expect(positions[0].average_cost).toBe(110.4);
  });

  it("uses same-day baseline_created_at to exclude earlier imported trades", () => {
    const adjustments: PositionAdjustment[] = [
      {
        id: "adj-1",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        adjusted_quantity: 50,
        adjusted_cost: 6000,
        baseline_traded_at: "2026-01-03",
        baseline_created_at: "2026-01-03T09:00:00.000Z",
        created_at: "2026-01-03T09:00:00.000Z",
        updated_at: "2026-01-03T09:00:00.000Z"
      }
    ];

    const positions = buildPositions(
      [
        trade({ id: "same-day-early", traded_at: "2026-01-03", created_at: "2026-01-03T08:00:00.000Z", quantity: 10, gross_amount: 1000, fee: 12.83, net_amount: 1012.83 }),
        trade({ id: "same-day-late", traded_at: "2026-01-03", created_at: "2026-01-03T10:00:00.000Z", quantity: 20, gross_amount: 2400, fee: 12.83, net_amount: 2412.83, unit_price: 120 })
      ],
      [stock],
      [],
      adjustments
    );

    expect(positions[0].quantity).toBe(70);
    expect(positions[0].holding_cost).toBe(8412.83);
  });

  it("includes buy fees in holding cost while keeping average cost fee-free", () => {
    const positions = buildPositions([trade({ quantity: 100, gross_amount: 10000, fee: 12.83, net_amount: 10012.83 })], [stock]);

    expect(positions[0].holding_cost).toBe(10012.83);
    expect(positions[0].remaining_cost).toBe(10012.83);
    expect(positions[0].average_cost).toBe(100);
  });

  it("calculates estimated profit after future sell fee and stock transaction tax", () => {
    const position = buildPositions([trade({ quantity: 100, gross_amount: 10000, fee: 20, net_amount: 10020 })], [stock])[0];

    expect(position.market_value).toBe(11000);
    expect(position.book_profit).toBe(980);
    expect(position.estimated_sell_fee).toBe(14.11);
    expect(position.estimated_sell_tax).toBe(33);
    expect(position.estimated_profit).toBe(932.89);
    expect(position.estimated_return_rate).toBeCloseTo(0.0931, 4);
  });

  it("uses 0.1 percent estimated transaction tax for ETFs", () => {
    const etfStock = { ...stock, symbol: "0050", name: "元大台灣50", industry: "ETF" };
    const position = buildPositions([trade({ quantity: 100, gross_amount: 10000, fee: 20, net_amount: 10020 })], [etfStock])[0];

    expect(position.estimated_sell_fee).toBe(14.11);
    expect(position.estimated_sell_tax).toBe(11);
    expect(position.estimated_profit).toBe(954.89);
  });

  it("rejects selling more than current holdings", () => {
    const result = validateSellQuantity([trade({ quantity: 100 })], "stock-1", "portfolio-1", 101);

    expect(result.available).toBe(100);
    expect(result.valid).toBe(false);
  });

  it("keeps realized profit after a full exit", () => {
    const positions = buildPositions(
      [
        trade({ id: "1", type: "buy", quantity: 100, net_amount: 10020 }),
        trade({ id: "2", type: "sell", quantity: 100, gross_amount: 12000, fee: 20, tax: 36, net_amount: 11944, traded_at: "2026-01-02" })
      ],
      [stock]
    );

    expect(positions[0].quantity).toBe(0);
    expect(positions[0].remaining_cost).toBe(0);
    expect(positions[0].realized_profit).toBe(1924);
  });

  it("treats same-day buys before sells for position math", () => {
    const positions = buildPositions(
      [
        trade({ id: "sell-1", type: "sell", quantity: 60, traded_at: "2026-01-03", created_at: "2026-01-03T08:00:00.000Z", gross_amount: 7200, fee: 20, tax: 21.6, net_amount: 7158.4 }),
        trade({ id: "buy-1", type: "buy", quantity: 100, traded_at: "2026-01-03", created_at: "2026-01-03T09:00:00.000Z", net_amount: 10020 })
      ],
      [stock]
    );

    expect(positions[0].quantity).toBe(40);
    expect(positions[0].realized_profit).toBeCloseTo(1146.4, 6);
  });

  it("uses portfolio-scoped tags and industry overrides before global stock data", () => {
    const tags: StockTag[] = [
      { id: "global-tag", user_id: "user-1", stock_id: "stock-1", name: "全域標籤" },
      { id: "scoped-tag", user_id: "user-1", portfolio_id: "portfolio-1", stock_id: "stock-1", name: "帳本標籤" }
    ];
    const overrides: PortfolioStockOverride[] = [
      {
        id: "override-1",
        user_id: "user-1",
        portfolio_id: "portfolio-1",
        stock_id: "stock-1",
        industry_override: "ETF",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ];

    const positions = buildPositions([trade({ quantity: 100, net_amount: 10012.83 })], [stock], tags, [], overrides);

    expect(positions[0].industry).toBe("ETF");
    expect(positions[0].tags).toEqual(["帳本標籤"]);
  });
});

describe("calculateDashboardMetrics", () => {
  it("aggregates cash, holding value, and return rate", () => {
    const portfolio: Portfolio = {
      id: "portfolio-1",
      user_id: "user-1",
      name: "台股主帳本",
      currency: "TWD",
      initial_amount: 100000,
      cash_balance: 50000,
      total_deposits: 100000,
      total_withdrawals: 0,
      note: null,
      created_at: "",
      updated_at: ""
    };

    const position = buildPositions([trade({ quantity: 100, net_amount: 10020 })], [stock])[0];
    const metrics = calculateDashboardMetrics([portfolio], [position]);

    expect(metrics.cash).toBe(50000);
    expect(metrics.holdingCost).toBe(10020);
    expect(metrics.holdingsValue).toBe(11000);
    expect(metrics.totalAssets).toBe(61000);
    expect(metrics.estimatedProfit).toBe(932.89);
    expect(metrics.unrealizedProfit).toBe(932.89);
    expect(metrics.totalReturnRate).toBe(0.0093289);
  });

  it("uses only current inventory holding cost for dashboard holding cost", () => {
    const portfolio: Portfolio = {
      id: "portfolio-1",
      user_id: "user-1",
      name: "台股主帳本",
      currency: "TWD",
      initial_amount: 100000,
      cash_balance: 50000,
      total_deposits: 100000,
      total_withdrawals: 0,
      note: null,
      created_at: "",
      updated_at: ""
    };

    const openPosition = buildPositions([trade({ quantity: 100, net_amount: 10020 })], [stock])[0];
    const soldOutPosition = {
      ...openPosition,
      quantity: 0,
      holding_cost: 99999,
      market_value: 99999,
      unrealized_profit: 99999,
      realized_profit: 1200
    };
    const metrics = calculateDashboardMetrics([portfolio], [openPosition, soldOutPosition]);

    expect(metrics.holdingCost).toBe(10020);
    expect(metrics.holdingsValue).toBe(11000);
    expect(metrics.estimatedProfit).toBe(932.89);
    expect(metrics.unrealizedProfit).toBe(932.89);
    expect(metrics.realizedProfit).toBe(1200);
  });
});
