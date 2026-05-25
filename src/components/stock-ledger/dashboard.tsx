import type { DashboardMetrics, Portfolio, Position, Stock, Trade } from "@/lib/types";
import { currency, percent, profitClass } from "@/lib/format";
import { ListSection, Metric, Row, SmallCard } from "./ui";

function toneClass(value: number) {
  if (value > 0) return "text-coral";
  if (value < 0) return "text-mint";
  return "text-ink";
}

export function Dashboard({
  metrics,
  positions,
  trades,
  stocks,
  portfolios,
  selectedPortfolioId,
  onPortfolioChange
}: {
  metrics: DashboardMetrics;
  positions: Position[];
  trades: Trade[];
  stocks: Stock[];
  portfolios: Portfolio[];
  selectedPortfolioId: string;
  onPortfolioChange: (portfolioId: string) => void;
}) {
  const topPositions = positions
    .filter((position) => position.quantity > 0)
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 4);
  const recentTrades = trades.slice(0, 5);
  const stockMap = new Map(stocks.map((stock) => [stock.id, stock]));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold">帳本篩選</span>
          <select
            className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3 outline-none focus:border-mint"
            value={selectedPortfolioId}
            onChange={(event) => onPortfolioChange(event.target.value)}
          >
            <option value="all">全部帳本</option>
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="overflow-hidden rounded-lg bg-ink shadow-soft">
        <div className="border-b border-white/10 px-5 py-5 text-white">
          <p className="text-sm text-white/65">總資產</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{currency(metrics.totalAssets)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="總損益" value={currency(metrics.totalProfit)} strong className={metrics.totalProfit >= 0 ? "text-red-200" : "text-emerald-200"} />
            <Metric label="總報酬率" value={percent(metrics.totalReturnRate)} strong className={metrics.totalReturnRate >= 0 ? "text-red-200" : "text-emerald-200"} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <div className="bg-ink px-5 py-4 text-white">
            <p className="text-xs text-white/55">現金</p>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.cash)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <p className="text-xs text-white/55">持倉成本</p>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.holdingCost)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <p className="text-xs text-white/55">持股市值</p>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.holdingsValue)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <p className="text-xs text-white/55">總持股報酬</p>
            <p className={"mt-2 text-lg font-semibold " + toneClass(metrics.unrealizedProfit + metrics.realizedProfit)}>{currency(metrics.realizedProfit + metrics.unrealizedProfit)}</p>
          </div>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <SmallCard label="已實現損益" value={currency(metrics.realizedProfit)} valueClass={profitClass(metrics.realizedProfit)} />
        <SmallCard label="未實現損益" value={currency(metrics.unrealizedProfit)} valueClass={profitClass(metrics.unrealizedProfit)} />
      </section>
      <ListSection title="持股排行" empty="尚無持股">
        {topPositions.map((position) => (
          <div key={position.stock_id} className="rounded-lg border border-ink/10 bg-paper/35 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{position.symbol + " " + position.name}</p>
                <p className="mt-1 truncate text-sm text-ink/55">{"均價 " + currency(position.average_cost) + " · " + position.industry}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold">{currency(position.market_value)}</p>
                <p className="mt-1 text-xs text-ink/50">{percent(metrics.holdingsValue > 0 ? position.market_value / metrics.holdingsValue : 0)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className={profitClass(position.unrealized_profit)}>{"損益 " + currency(position.unrealized_profit)}</span>
              <span className={profitClass(position.unrealized_profit)}>{"報酬率 " + percent(position.unrealized_return_rate)}</span>
            </div>
          </div>
        ))}
      </ListSection>
      <ListSection title="最近交易" empty="尚無交易">
        {recentTrades.map((trade) => (
          <Row
            key={trade.id}
            title={(trade.type === "buy" ? "買入" : "賣出") + " " + (stockMap.get(trade.stock_id)?.symbol ?? "") + " " + (stockMap.get(trade.stock_id)?.name ?? "")}
            subtitle={trade.traded_at + " · " + trade.quantity + " 股"}
            right={currency(trade.net_amount)}
          />
        ))}
      </ListSection>
    </div>
  );
}
