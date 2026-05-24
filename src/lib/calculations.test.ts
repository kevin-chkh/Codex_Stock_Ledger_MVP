import { describe, expect, it } from "vitest";
import {
  buildPositions,
  calculateDashboardMetrics,
  calculateTradeAmounts,
  DEFAULT_SETTINGS,
  validateSellQuantity
} from "./calculations";
import type { Portfolio, Stock, Trade } from "./types";

const stock: Stock = {
  id: "stock-1",
  user_id: "user-1",
  symbol: "2330",
  name: "台積電",
  market: "TW",
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
      fee: 20,
      tax: 0,
      netAmount: 10020
    });
  });

  it("calculates sell net amount with tax", () => {
    expect(calculateTradeAmounts({ type: "sell", quantity: 100, unitPrice: 100, settings: DEFAULT_SETTINGS })).toEqual({
      grossAmount: 10000,
      fee: 20,
      tax: 30,
      netAmount: 9950
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
    expect(positions[0].average_cost).toBe(110.2);
    expect(positions[0].realized_profit).toBe(950.5);
    expect(positions[0].unrealized_profit).toBe(-30);
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
    expect(metrics.holdingsValue).toBe(11000);
    expect(metrics.totalAssets).toBe(61000);
    expect(metrics.unrealizedProfit).toBe(980);
    expect(metrics.totalReturnRate).toBe(0.0098);
  });
});
