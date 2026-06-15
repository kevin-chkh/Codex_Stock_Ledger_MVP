export type TradeType = "buy" | "sell";
export type CashMovementType = "deposit" | "withdraw" | "adjust";

export type Portfolio = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  initial_amount: number;
  cash_balance: number;
  total_deposits: number;
  total_withdrawals: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CashMovement = {
  id: string;
  user_id: string;
  portfolio_id: string;
  type: CashMovementType;
  amount: number;
  balance_after: number;
  occurred_at: string;
  note: string | null;
};

export type Stock = {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  market: string;
  industry: string | null;
  current_price: number;
  price_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockTag = {
  id: string;
  user_id: string;
  portfolio_id?: string | null;
  stock_id: string;
  name: string;
};

export type PortfolioStockOverride = {
  id: string;
  user_id: string;
  portfolio_id: string;
  stock_id: string;
  industry_override: string | null;
  created_at: string;
  updated_at: string;
};

export type PositionAdjustment = {
  id: string;
  user_id: string;
  portfolio_id: string;
  stock_id: string;
  adjusted_quantity: number;
  adjusted_cost: number;
  baseline_traded_at?: string | null;
  baseline_created_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Trade = {
  id: string;
  user_id: string;
  portfolio_id: string;
  stock_id: string;
  type: TradeType;
  traded_at: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  fee: number;
  tax: number;
  net_amount: number;
  note: string | null;
  created_at: string;
  stock?: Stock;
};

export type UserSettings = {
  user_id: string;
  fee_rate: number;
  tax_rate: number;
  minimum_fee: number;
  allow_negative_cash: boolean;
};

export type Position = {
  portfolio_id: string;
  stock_id: string;
  symbol: string;
  name: string;
  industry: string;
  tags: string[];
  quantity: number;
  holding_cost: number;
  average_cost: number;
  remaining_cost: number;
  paid_fee: number;
  paid_tax: number;
  realized_profit: number;
  current_price: number;
  price_updated_at: string | null;
  market_value: number;
  book_profit: number;
  estimated_sell_fee: number;
  estimated_sell_tax: number;
  estimated_profit: number;
  estimated_return_rate: number;
  unrealized_profit: number;
  unrealized_return_rate: number;
  total_profit: number;
  total_return_rate: number;
  has_manual_adjustment?: boolean;
  trade_quantity?: number;
  trade_holding_cost?: number;
};

export type DashboardMetrics = {
  cash: number;
  totalDeposits: number;
  holdingCost: number;
  holdingsValue: number;
  totalAssets: number;
  realizedProfit: number;
  estimatedProfit: number;
  unrealizedProfit: number;
  totalProfit: number;
  totalReturnRate: number;
};
