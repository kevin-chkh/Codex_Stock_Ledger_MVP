import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./calculations";
import { applyTradeToPortfolios, deleteTradeFromPortfolios, hasOversoldPosition, makeTrade } from "./trade-ledger";
import type { Portfolio, Trade } from "./types";

function portfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "portfolio-1",
    user_id: "user-1",
    name: "台股主帳本",
    currency: "TWD",
    initial_amount: 100000,
    cash_balance: 100000,
    total_deposits: 100000,
    total_withdrawals: 0,
    note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "trade-1",
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
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("trade ledger integration", () => {
  it("adds a buy trade and decreases portfolio cash", () => {
    const buy = makeTrade({
      id: "buy-1",
      userId: "user-1",
      portfolioId: "portfolio-1",
      stockId: "stock-1",
      type: "buy",
      quantity: 100,
      unitPrice: 100,
      settings: DEFAULT_SETTINGS,
      tradedAt: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const [updated] = applyTradeToPortfolios([portfolio()], null, buy, "2026-01-02T00:00:00.000Z");

    expect(buy.net_amount).toBe(10012.83);
    expect(updated.cash_balance).toBe(89987.17);
    expect(updated.updated_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("keeps broker-entered sell net amount exact when provided", () => {
    const sell = makeTrade({
      id: "sell-net-1",
      userId: "user-1",
      portfolioId: "portfolio-1",
      stockId: "stock-1",
      type: "sell",
      quantity: 2000,
      unitPrice: 13.44,
      settings: DEFAULT_SETTINGS,
      tradedAt: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z",
      netAmountOverride: 26756
    });

    expect(sell.gross_amount).toBe(26880);
    expect(sell.net_amount).toBe(26756);
  });

  it("edits a buy trade and applies only the cash delta", () => {
    const original = trade({ id: "buy-1", net_amount: 10020 });
    const edited = trade({ id: "buy-1", net_amount: 12020, gross_amount: 12000, unit_price: 120 });
    const currentPortfolio = portfolio({ cash_balance: 89980 });

    const [updated] = applyTradeToPortfolios([currentPortfolio], original, edited, "2026-01-03T00:00:00.000Z");

    expect(updated.cash_balance).toBe(87980);
  });

  it("deletes a sell trade and reverses its cash impact", () => {
    const sell = trade({ id: "sell-1", type: "sell", gross_amount: 11000, fee: 20, tax: 33, net_amount: 10947 });
    const currentPortfolio = portfolio({ cash_balance: 110947 });

    const [updated] = deleteTradeFromPortfolios([currentPortfolio], sell, "2026-01-04T00:00:00.000Z");

    expect(updated.cash_balance).toBe(100000);
  });

  it("detects oversold positions after edit or delete", () => {
    const trades = [
      trade({ id: "buy-1", type: "buy", quantity: 100, traded_at: "2026-01-01" }),
      trade({ id: "sell-1", type: "sell", quantity: 120, net_amount: 11944, traded_at: "2026-01-02" })
    ];

    expect(hasOversoldPosition(trades)).toBe(true);
    expect(hasOversoldPosition([trades[0], { ...trades[1], quantity: 80 }])).toBe(false);
  });

  it("allows same-day buys to offset sells when only date precision is available", () => {
    const sameDayTrades = [
      trade({ id: "sell-1", type: "sell", quantity: 10, traded_at: "2026-01-03", created_at: "2026-01-03T08:00:00.000Z", net_amount: 997 }),
      trade({ id: "buy-1", type: "buy", quantity: 10, traded_at: "2026-01-03", created_at: "2026-01-03T09:00:00.000Z", net_amount: 10020 })
    ];

    expect(hasOversoldPosition(sameDayTrades)).toBe(false);
  });

  it("does not block an unrelated stock when another position is oversold", () => {
    const trades = [
      trade({ id: "buy-2330", stock_id: "stock-2330", quantity: 10, traded_at: "2026-01-01" }),
      trade({ id: "sell-2603", stock_id: "stock-2603", type: "sell", quantity: 5, traded_at: "2026-01-02", net_amount: 4800 })
    ];

    expect(hasOversoldPosition(trades)).toBe(true);
    expect(hasOversoldPosition(trades, { portfolioId: "portfolio-1", stockId: "stock-2330" })).toBe(false);
  });

  it("lets a new buy reduce an existing oversold gap", () => {
    const trades = [
      trade({ id: "sell-2330", stock_id: "stock-2330", type: "sell", quantity: 20, traded_at: "2026-01-01", net_amount: 19940 }),
      trade({ id: "buy-2330", stock_id: "stock-2330", type: "buy", quantity: 10, traded_at: "2026-01-02", net_amount: 10020 })
    ];

    expect(hasOversoldPosition(trades, { portfolioId: "portfolio-1", stockId: "stock-2330" })).toBe(true);
  });

  it("runs buy/sell/edit/delete flow and keeps cash consistent", () => {
    const base = portfolio({ cash_balance: 100000 });
    const buy = makeTrade({
      id: "buy-1",
      userId: "user-1",
      portfolioId: "portfolio-1",
      stockId: "stock-1",
      type: "buy",
      quantity: 100,
      unitPrice: 100,
      settings: DEFAULT_SETTINGS,
      tradedAt: "2026-01-01",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    const sell = makeTrade({
      id: "sell-1",
      userId: "user-1",
      portfolioId: "portfolio-1",
      stockId: "stock-1",
      type: "sell",
      quantity: 60,
      unitPrice: 120,
      settings: DEFAULT_SETTINGS,
      tradedAt: "2026-01-02",
      createdAt: "2026-01-02T00:00:00.000Z"
    });

    const afterBuy = applyTradeToPortfolios([base], null, buy, "2026-01-01T00:00:00.000Z");
    const afterSell = applyTradeToPortfolios(afterBuy, null, sell, "2026-01-02T00:00:00.000Z");
    expect(afterSell[0]?.cash_balance).toBeCloseTo(97156.34, 6);

    const editedSell = { ...sell, quantity: 40, gross_amount: 4800, fee: 20, tax: 14.4, net_amount: 4765.6 };
    const afterEdit = applyTradeToPortfolios(afterSell, sell, editedSell, "2026-01-03T00:00:00.000Z");
    expect(afterEdit[0]?.cash_balance).toBeCloseTo(94752.77, 6);

    const afterDelete = deleteTradeFromPortfolios(afterEdit, editedSell, "2026-01-04T00:00:00.000Z");
    expect(afterDelete[0]?.cash_balance).toBeCloseTo(89987.17, 6);
    expect(hasOversoldPosition([buy, editedSell])).toBe(false);
  });
});
