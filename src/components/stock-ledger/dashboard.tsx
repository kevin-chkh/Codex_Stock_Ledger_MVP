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
  const [showAllPositions, setShowAllPositions] = useState(false);
  const rankedPositions = positions
    .filter((position) => position.quantity > 0)
    .sort((a, b) => b.holding_cost - a.holding_cost);
  const topPositions = showAllPositions ? rankedPositions : rankedPositions.slice(0, 4);
  const recentTrades = trades.slice(0, 5);
  const stockMap = new Map(stocks.map((stock) => [stock.id, stock]));
  const profitBreakdown = useMemo(() => {
    const grouped = new Map<
      string,
      {
        stockId: string;
        symbol: string;
        name: string;
        quantity: number;
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
        quantity: 0,
        realizedProfit: 0,
        unrealizedProfit: 0,
        unrealizedReturnRate: 0
      };
      current.quantity += position.quantity;
      current.realizedProfit += position.realized_profit;
      current.unrealizedProfit += position.estimated_profit;
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
              <div className="flex items-center gap-1 text-sm text-white/65">
                <p>總資產</p>
                <InfoTip
                  label="總資產說明"
                  body={[
                    "總資產 = 現金 + 持股市值。",
                    "持股市值只計入目前仍持有的股票，已清倉股票不會再計入資產。"
                  ]}
                />
              </div>
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
            <Metric
              label="總損益"
              value={currency(metrics.totalProfit)}
              strong
              className={metrics.totalProfit >= 0 ? "text-red-200" : "text-emerald-200"}
              tipBody={[
                "總損益 = 已實現損益 + 預估損益。",
                "預估損益已扣除未來賣出手續費與交易稅。"
              ]}
            />
            <Metric
              label="總報酬率"
              value={percent(metrics.totalReturnRate)}
              strong
              className={metrics.totalReturnRate >= 0 ? "text-red-200" : "text-emerald-200"}
              tipBody={[
                "總報酬率 = 總損益 / 累計投入。",
                "累計投入來自帳本資金加入紀錄，不包含轉出金額。"
              ]}
            />
          </div>
          <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-xs leading-5 text-white/65">
            預估損益已扣除賣出手續費與交易稅，較接近實際可落袋金額。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10">
          <div className="bg-ink px-5 py-4 text-white">
            <div className="flex items-center gap-1 text-xs text-white/55">
              <p>現金</p>
              <InfoTip
                label="現金說明"
                body={[
                  "現金為目前帳本的 cash_balance。",
                  "買入會扣除現金，賣出與資金加入會增加現金，轉出會減少現金。"
                ]}
              />
            </div>
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
            <div className="flex items-center gap-1 text-xs text-white/55">
              <p>持股市值</p>
              <InfoTip
                label="持股市值說明"
                body={[
                  "持股市值 = 每檔持股數量 × 現價後加總。",
                  "只計入目前仍持有的股票。現價更新失敗時會沿用最後成功更新的價格。"
                ]}
              />
            </div>
            <p className="mt-2 text-lg font-semibold">{currency(metrics.holdingsValue)}</p>
          </div>
          <div className="bg-ink px-5 py-4 text-white">
            <div className="flex items-center gap-1">
              <p className="text-xs text-white/55">總持股報酬</p>
              <InfoTip
                label="總持股報酬說明"
                body={[
                  "總持股報酬等於已實現損益加預估損益。",
                  "預估損益已扣除未來賣出手續費與證交稅。"
                ]}
              />
            </div>
            <p className={"mt-2 text-lg font-semibold " + toneClass(metrics.estimatedProfit + metrics.realizedProfit)}>{currency(metrics.realizedProfit + metrics.estimatedProfit)}</p>
          </div>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <SmallCard
          label="已實現損益"
          value={currency(metrics.realizedProfit)}
          valueClass={profitClass(metrics.realizedProfit)}
          hint="點擊查看各股明細"
          tipBody={[
            "已實現損益來自賣出交易。",
            "已賣出的股票即使清倉，損益仍會保留在已實現明細。"
          ]}
          onClick={() => setDetailMode((current) => (current === "realized" ? null : "realized"))}
        />
        <SmallCard
          label="預估損益"
          value={currency(metrics.estimatedProfit)}
          valueClass={profitClass(metrics.estimatedProfit)}
          hint="點擊查看各股明細"
          tipBody={[
            "預估損益 = 持股市值 - 預估賣出手續費 - 預估交易稅 - 持倉成本。",
            "此數字只計入目前仍持有的股票。"
          ]}
          onClick={() => setDetailMode((current) => (current === "unrealized" ? null : "unrealized"))}
        />
      </section>
      {detailMode && (
        <ListSection title={detailMode === "realized" ? "已實現損益明細" : "預估損益明細"} empty="目前沒有可顯示的股票明細">
          {detailItems.map((item) => (
            <Row
              key={item.symbol}
              title={item.symbol + " " + item.name}
              subtitle={
                detailMode === "realized"
                  ? item.quantity === 0
                    ? "已實現損益 · 已清倉"
                    : "已實現損益"
                  : "預估損益 · 報酬率 " + percent(item.unrealizedReturnRate)
              }
              right={currency(detailMode === "realized" ? item.realizedProfit : item.unrealizedProfit)}
              rightClass={profitClass(detailMode === "realized" ? item.realizedProfit : item.unrealizedProfit)}
            />
          ))}
        </ListSection>
      )}
      <ListSection
        title={showAllPositions ? `持股排行 ${rankedPositions.length} 檔` : "持股排行"}
        empty="尚無持股"
      >
        {rankedPositions.length > 4 ? (
          <div className="mb-1 flex justify-end">
            <button
              className="rounded-md border border-ink/10 px-3 py-2 text-xs font-semibold text-ink/75"
              onClick={() => setShowAllPositions((current) => !current)}
            >
              {showAllPositions ? "收合" : "全部展開"}
            </button>
          </div>
        ) : null}
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
              <span className={profitClass(position.estimated_profit)}>{"預估 " + currency(position.estimated_profit)}</span>
              <span className={profitClass(position.estimated_profit)}>{"報酬率 " + percent(position.estimated_return_rate)}</span>
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
