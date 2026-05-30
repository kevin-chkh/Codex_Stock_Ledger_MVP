import { useMemo, useState } from "react";
import type { DashboardMetrics, Portfolio, Position, Stock, Trade } from "@/lib/types";
import { currency, percent, profitClass } from "@/lib/format";
import { InfoTip, ListSection, Metric, Row, SmallCard } from "./ui";

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
  onPortfolioChange,
  onEditTrade
}: {
  metrics: DashboardMetrics;
  positions: Position[];
  trades: Trade[];
  stocks: Stock[];
  portfolios: Portfolio[];
  selectedPortfolioId: string;
  onPortfolioChange: (portfolioId: string) => void;
  onEditTrade: (trade: Trade) => void;
}) {
  const [detailMode, setDetailMode] = useState<"realized" | "unrealized" | null>(null);
  const topPositions = positions
    .filter((position) => position.quantity > 0)
    .sort((a, b) => b.holding_cost - a.holding_cost)
    .slice(0, 4);
  const recentTrades = trades.slice(0, 5);
  const stockMap = new Map(stocks.map((stock) => [stock.id, stock]));
  const profitBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      {
        stockId: string;
        symbol: string;
        name: string;
        realizedProfit: number;
        unrealizedProfit: number;
        unrealizedReturnRate: number;
      }
    >();

    for (const position of positions) {
      const current = grouped.get(position.stock_id) ?? {
        stockId: position.stock_id,
        symbol: position.symbol,
        name: position.name,
        realizedProfit: 0,
        unrealizedProfit: 0,
        unrealizedReturnRate: 0
      };
      current.realizedProfit += position.realized_profit;
      current.unrealizedProfit += position.unrealized_profit;
      grouped.set(position.stock_id, current);
    }

    return [...grouped.values()]
      .map((item) => {
        const matched = positions.filter((position) => position.stock_id === item.stockId);
        const totalCost = matched.reduce((sum, position) => sum + position.remaining_cost, 0);
        return {
          ...item,
          unrealizedReturnRate: totalCost > 0 ? item.unrealizedProfit / totalCost : 0
        };
      })
      .sort((a, b) => {
        if (detailMode === "realized") return b.realizedProfit - a.realizedProfit;
        return b.unrealizedProfit - a.unrealizedProfit;
      });
  }, [detailMode, positions]);

  const realizedItems = profitBreakdown.filter((item) => item.realizedProfit !== 0);
  const unrealizedItems = profitBreakdown.filter((item) => item.unrealizedProfit !== 0);
  const detailItems = detailMode === "realized" ? realizedItems : unrealizedItems;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg bg-ink shadow-soft">
        <div className="border-b border-white/10 px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white/65">總資產</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">{currency(metrics.totalAssets)}</p>
            </div>
            <select
              className="h-10 max-w-[11rem] rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/30"
              value={selectedPortfolioId}
              onChange={(event) => onPortfolioChange(event.target.value)}
            >
              <option className="text-ink" value="all">
                全部帳本
              </option>
              {portfolios.map((portfolio) => (
                <option className="text-ink" key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          </div>
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
            <div className="flex items-center gap-1">
              <p className="text-xs text-white/55">持倉成本</p>
              <InfoTip
                label="持倉成本說明"
                body={[
                  "持倉成本為目前尚持有部位的剩餘成本。",
                  "此數值包含買入手續費，不含已賣出部位已實現的成本。"
                ]}
              />
            </div>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.holdingCost)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <p className="text-xs text-white/55">持股市值</p>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.holdingsValue)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <div className="flex items-center gap-1">
              <p className="text-xs text-white/55">總持股報酬</p>
              <InfoTip
                label="總持股報酬說明"
                body={[
                  "總持股報酬等於已實現損益加未實現損益。",
                  "它反映目前持倉與已賣出部位合計的持股獲利表現。"
                ]}
              />
            </div>
            <p className={"mt-2 text-lg font-semibold " + toneClass(metrics.unrealizedProfit + metrics.realizedProfit)}>{currency(metrics.realizedProfit + metrics.unrealizedProfit)}</p>
          </div>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <SmallCard
          label="已實現損益"
          value={currency(metrics.realizedProfit)}
          valueClass={profitClass(metrics.realizedProfit)}
          hint="點擊查看各股明細"
          onClick={() => setDetailMode((current) => (current === "realized" ? null : "realized"))}
        />
        <SmallCard
          label="未實現損益"
          value={currency(metrics.unrealizedProfit)}
          valueClass={profitClass(metrics.unrealizedProfit)}
          hint="點擊查看各股明細"
          onClick={() => setDetailMode((current) => (current === "unrealized" ? null : "unrealized"))}
        />
      </section>
      {detailMode && (
        <ListSection title={detailMode === "realized" ? "已實現損益明細" : "未實現損益明細"} empty="目前沒有可顯示的股票明細">
          {detailItems.map((item) => (
            <Row
              key={item.symbol}
              title={item.symbol + " " + item.name}
              subtitle={detailMode === "realized" ? "已實現損益" : "未實現損益 · 報酬率 " + percent(item.unrealizedReturnRate)}
              right={currency(detailMode === "realized" ? item.realizedProfit : item.unrealizedProfit)}
              rightClass={profitClass(detailMode === "realized" ? item.realizedProfit : item.unrealizedProfit)}
            />
          ))}
        </ListSection>
      )}
      <ListSection title="持股排行" empty="尚無持股">
        {topPositions.map((position) => (
          <div key={position.stock_id} className="rounded-lg border border-ink/10 bg-paper/35 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{position.symbol + " " + position.name}</p>
                <p className="mt-1 truncate text-sm text-ink/55">{"均價 " + currency(position.average_cost) + " · 成本 " + currency(position.holding_cost)}</p>
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
          <button key={trade.id} className="w-full text-left" onClick={() => onEditTrade(trade)}>
          <Row
            key={trade.id}
            title={(trade.type === "buy" ? "買入" : "賣出") + " " + (stockMap.get(trade.stock_id)?.symbol ?? "") + " " + (stockMap.get(trade.stock_id)?.name ?? "")}
            subtitle={trade.traded_at + " · " + trade.quantity + " 股"}
            right={currency(trade.net_amount)}
          />
          </button>
        ))}
      </ListSection>
    </div>
  );
}
