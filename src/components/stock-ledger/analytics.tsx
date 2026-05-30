import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency, percent, profitClass } from "@/lib/format";
import { groupByValue, roundMoney } from "@/lib/calculations";
import type { Portfolio, Position, Stock, Trade } from "@/lib/types";
import { ListSection, PortfolioScopePicker, SmallCard } from "./ui";

const colors = ["#2f7d68", "#c6973f", "#c75b4d", "#4f6f9f", "#7c6a9d", "#61705f"];

type TrendWindow = "14d" | "30d";
type ProfitMode = "realized" | "unrealized";

export function Analytics({
  positions,
  trades,
  stocks,
  portfolios,
  selectedPortfolioId,
  onPortfolioChange,
  cash
}: {
  positions: Position[];
  trades: Trade[];
  stocks: Stock[];
  portfolios: Portfolio[];
  selectedPortfolioId: string;
  onPortfolioChange: (portfolioId: string) => void;
  cash: number;
}) {
  const [tagFilter, setTagFilter] = useState("all");
  const [trendWindow, setTrendWindow] = useState<TrendWindow>("14d");
  const [profitMode, setProfitMode] = useState<ProfitMode>("unrealized");

  const openPositions = useMemo(() => positions.filter((position) => position.quantity > 0), [positions]);
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    openPositions.forEach((position) => position.tags.forEach((tag) => tags.add(tag)));
    return [...tags].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [openPositions]);

  const filteredPositions = useMemo(
    () => (tagFilter === "all" ? openPositions : openPositions.filter((position) => position.tags.includes(tagFilter))),
    [openPositions, tagFilter]
  );

  const holdingsValue = filteredPositions.reduce((sum, position) => sum + position.market_value, 0);
  const industryData = groupByValue(filteredPositions, (position) => position.industry, (position) => position.market_value).map((item) => ({
    ...item,
    ratio: holdingsValue > 0 ? item.value / holdingsValue : 0
  }));
  const tagData = groupByValue(
    filteredPositions.flatMap((position) => (position.tags.length ? position.tags.map((tag) => ({ tag, value: position.market_value })) : [{ tag: "未標籤", value: position.market_value }])),
    (item) => item.tag,
    (item) => item.value
  ).map((item) => ({
    ...item,
    ratio: holdingsValue > 0 ? item.value / holdingsValue : 0
  }));

  const latestTradeDate = useMemo(() => {
    if (!trades.length) return new Date();
    return trades.reduce((latest, trade) => {
      const current = new Date(trade.traded_at + "T00:00:00");
      return current.getTime() > latest.getTime() ? current : latest;
    }, new Date(trades[0].traded_at + "T00:00:00"));
  }, [trades]);

  const trendData = useMemo(() => {
    const windowDays = trendWindow === "14d" ? 14 : 30;
    const start = new Date(latestTradeDate);
    start.setDate(start.getDate() - (windowDays - 1));

    const buckets = new Map<string, { label: string; buy: number; sell: number; net: number }>();
    for (let offset = 0; offset < windowDays; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = date.toISOString().slice(0, 10);
      buckets.set(key, {
        label: key.slice(5).replace("-", "/"),
        buy: 0,
        sell: 0,
        net: 0
      });
    }

    for (const trade of trades) {
      const key = trade.traded_at;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (trade.type === "buy") {
        bucket.buy = roundMoney(bucket.buy + trade.net_amount);
        bucket.net = roundMoney(bucket.net - trade.net_amount);
      } else {
        bucket.sell = roundMoney(bucket.sell + trade.net_amount);
        bucket.net = roundMoney(bucket.net + trade.net_amount);
      }
    }

    return [...buckets.values()];
  }, [latestTradeDate, trades, trendWindow]);

  const trendSummary = useMemo(
    () =>
      trendData.reduce(
        (acc, item) => ({
          buy: roundMoney(acc.buy + item.buy),
          sell: roundMoney(acc.sell + item.sell),
          net: roundMoney(acc.net + item.net)
        }),
        { buy: 0, sell: 0, net: 0 }
      ),
    [trendData]
  );

  const topIndustryRatio = industryData[0]?.ratio ?? 0;
  const sortedPositions = useMemo(() => [...filteredPositions].sort((a, b) => b.market_value - a.market_value), [filteredPositions]);
  const topPositionRatio = holdingsValue > 0 ? (sortedPositions[0]?.market_value ?? 0) / holdingsValue : 0;
  const topThreeRatio = holdingsValue > 0 ? sortedPositions.slice(0, 3).reduce((sum, position) => sum + position.market_value, 0) / holdingsValue : 0;

  const etfEquityData = useMemo(() => {
    const rows = [
      { name: "ETF", value: 0 },
      { name: "個股", value: 0 }
    ];
    for (const position of filteredPositions) {
      const bucket = isEtfPosition(position) ? rows[0] : rows[1];
      bucket.value = roundMoney(bucket.value + position.market_value);
    }
    return rows
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        ratio: holdingsValue > 0 ? item.value / holdingsValue : 0
      }));
  }, [filteredPositions, holdingsValue]);
  const etfRatio = etfEquityData.find((item) => item.name === "ETF")?.ratio ?? 0;

  const recentTrades = useMemo(() => {
    const windowDays = trendWindow === "14d" ? 14 : 30;
    const start = new Date(latestTradeDate);
    start.setDate(start.getDate() - (windowDays - 1));
    const startKey = start.toISOString().slice(0, 10);
    return trades.filter((trade) => trade.traded_at >= startKey);
  }, [latestTradeDate, trades, trendWindow]);

  const tradeBehavior = useMemo(() => {
    const stockMap = new Map(stocks.map((stock) => [stock.id, stock]));
    const buyTrades = recentTrades.filter((trade) => trade.type === "buy");
    const sellTrades = recentTrades.filter((trade) => trade.type === "sell");
    const avgBuyAmount = buyTrades.length
      ? roundMoney(buyTrades.reduce((sum, trade) => sum + trade.net_amount, 0) / buyTrades.length)
      : 0;
    const grouped = new Map<string, { label: string; count: number }>();
    for (const trade of recentTrades) {
      const stock = stockMap.get(trade.stock_id);
      const label = stock?.symbol && stock?.name ? `${stock.symbol} ${stock.name}` : trade.stock_id;
      const current = grouped.get(trade.stock_id) ?? { label, count: 0 };
      current.count += 1;
      grouped.set(trade.stock_id, current);
    }
    const mostTraded = [...grouped.values()].sort((a, b) => b.count - a.count)[0];
    return {
      buyCount: buyTrades.length,
      sellCount: sellTrades.length,
      avgBuyAmount,
      mostTradedLabel: mostTraded?.label ?? "尚無資料",
      mostTradedCount: mostTraded?.count ?? 0
    };
  }, [recentTrades, stocks]);

  const profitRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        label: string;
        realized: number;
        unrealized: number;
        returnRate: number;
        marketValue: number;
      }
    >();

    for (const position of filteredPositions) {
      const current = grouped.get(position.stock_id) ?? {
        key: position.stock_id,
        label: position.symbol + " " + position.name,
        realized: 0,
        unrealized: 0,
        returnRate: 0,
        marketValue: 0
      };
      current.realized = roundMoney(current.realized + position.realized_profit);
      current.unrealized = roundMoney(current.unrealized + position.unrealized_profit);
      current.marketValue = roundMoney(current.marketValue + position.market_value);
      current.returnRate = position.unrealized_return_rate;
      grouped.set(position.stock_id, current);
    }

    return [...grouped.values()]
      .filter((item) => (profitMode === "realized" ? item.realized !== 0 : item.unrealized !== 0))
      .sort((a, b) => (profitMode === "realized" ? b.realized - a.realized : b.unrealized - a.unrealized))
      .slice(0, 8);
  }, [filteredPositions, profitMode]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="mb-3">
          <PortfolioScopePicker
            label="目前："
            value={selectedPortfolioId}
            onChange={onPortfolioChange}
            options={[
              ["all", "全部帳本"],
              ...portfolios.map((portfolio) => [portfolio.id, portfolio.name])
            ]}
          />
        </div>
        <label className="block">
          <span className="text-sm font-semibold">依分類標籤篩選</span>
          <select className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3 outline-none focus:border-mint" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部標籤</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <SmallCard
          label="最大單一持股"
          value={percent(topPositionRatio)}
          hint={sortedPositions[0] ? `${sortedPositions[0].symbol} ${sortedPositions[0].name}` : "尚無資料"}
        />
        <SmallCard label="前 3 大持股" value={percent(topThreeRatio)} hint="占總持股市值比例" />
        <SmallCard label="最大產業占比" value={percent(topIndustryRatio)} hint={industryData[0]?.name ?? "尚無資料"} />
      </section>

      <ChartCard title="產業持股比例" data={industryData} empty="尚無產業配置資料" />
      <ChartCard title="標籤持股比例" data={tagData} empty="尚無標籤配置資料" />
      <ChartCard title="ETF / 個股配置" data={etfEquityData} empty="尚無配置資料" />
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div>
          <h2 className="font-bold">資產組成</h2>
          <p className="mt-1 text-xs text-ink/50">目前先顯示當前組成，歷史總資產趨勢即將推出。</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricTile label="現金" value={currency(cash)} />
          <MetricTile label="持股市值" value={currency(holdingsValue)} />
          <MetricTile label="總持股檔數" value={`${filteredPositions.length} 檔`} />
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div>
          <h2 className="font-bold">持股集中度</h2>
          <p className="mt-1 text-xs text-ink/50">快速看目前部位是否過度集中在少數標的</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricTile label="最大單一持股" value={percent(topPositionRatio)} />
          <MetricTile label="前 3 大持股" value={percent(topThreeRatio)} />
          <MetricTile label="ETF 配置" value={percent(etfRatio)} />
        </div>
        <div className="mt-3 space-y-2">
          {sortedPositions.slice(0, 5).map((position, index) => (
            <div className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-3 text-sm" key={position.stock_id}>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  #{index + 1} {position.symbol} {position.name}
                </p>
                <p className="mt-1 truncate text-ink/55">{currency(position.market_value)} · {position.industry}</p>
              </div>
              <p className="shrink-0 font-bold">{percent(holdingsValue > 0 ? position.market_value / holdingsValue : 0)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">投資趨勢</h2>
            <p className="mt-1 text-xs text-ink/50">比較最近買入、賣出與淨投入變化</p>
          </div>
          <div className="rounded-md bg-paper p-1 text-sm">
            <button className={"rounded px-3 py-1.5 " + (trendWindow === "14d" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setTrendWindow("14d")}>
              近 2 週
            </button>
            <button className={"rounded px-3 py-1.5 " + (trendWindow === "30d" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setTrendWindow("30d")}>
              近 1 個月
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MetricTile label="買入" value={currency(trendSummary.buy)} />
          <MetricTile label="賣出" value={currency(trendSummary.sell)} />
          <MetricTile label="淨投入" value={currency(trendSummary.net)} valueClass={profitClass(trendSummary.net)} />
        </div>
        {trendData.length ? (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5dfd0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6f685c" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(value) => compactCurrency(Number(value))} tick={{ fontSize: 11, fill: "#6f685c" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => currency(Number(value))} />
                <Bar dataKey="buy" name="買入" fill="#d45c4a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="sell" name="賣出" fill="#35624d" radius={[6, 6, 0, 0]} />
                <Bar dataKey="net" name="淨投入" fill="#c6973f" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink/55">尚無近期交易資料</p>
        )}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">交易行為摘要</h2>
            <p className="mt-1 text-xs text-ink/50">依目前時間區間彙整最近的操作密度與交易習慣</p>
          </div>
          <p className="text-xs text-ink/50">{trendWindow === "14d" ? "近 2 週" : "近 1 個月"}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MetricTile label="買入次數" value={`${tradeBehavior.buyCount} 次`} />
          <MetricTile label="賣出次數" value={`${tradeBehavior.sellCount} 次`} />
          <MetricTile label="平均單筆買入" value={currency(tradeBehavior.avgBuyAmount)} />
          <MetricTile label="最常交易標的" value={tradeBehavior.mostTradedCount ? `${tradeBehavior.mostTradedCount} 次` : "0 次"} />
        </div>
        <div className="mt-3 rounded-md bg-paper px-3 py-3">
          <p className="text-xs text-ink/55">最常交易標的</p>
          <p className="mt-1 text-sm font-semibold">{tradeBehavior.mostTradedLabel}</p>
        </div>
      </section>

      <ListSection title={profitMode === "realized" ? "已實現損益排行" : "未實現損益排行"} empty="尚無可顯示的損益資料">
        <div className="rounded-md bg-paper p-1 text-sm">
          <button className={"rounded px-3 py-1.5 " + (profitMode === "unrealized" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setProfitMode("unrealized")}>
            未實現
          </button>
          <button className={"rounded px-3 py-1.5 " + (profitMode === "realized" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setProfitMode("realized")}>
            已實現
          </button>
        </div>
        {profitRows.map((item) => {
          const value = profitMode === "realized" ? item.realized : item.unrealized;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.label}</p>
                <p className="mt-1 truncate text-sm text-ink/55">
                  {profitMode === "realized" ? "已實現損益" : "市值 " + currency(item.marketValue) + " · 報酬率 " + percent(item.returnRate)}
                </p>
              </div>
              <p className={"shrink-0 text-sm font-bold " + profitClass(value)}>{currency(value)}</p>
            </div>
          );
        })}
      </ListSection>
    </div>
  );
}

function ChartCard({
  title,
  data,
  empty
}: {
  title: string;
  data: { name: string; value: number; ratio: number }[];
  empty: string;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="font-bold">{title}</h2>
      {data.length ? (
        <>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
                  {data.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item) => {
                    const ratio = typeof item?.payload?.ratio === "number" ? percent(item.payload.ratio) : "";
                    return [`${currency(Number(value))} · ${ratio}`, "市值 / 占比"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {data.slice(0, 6).map((item, index) => (
              <div className="flex items-center justify-between gap-3 rounded-md bg-paper/70 px-3 py-2.5 text-sm" key={item.name}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  <span className="truncate font-medium">{item.name}</span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">{percent(item.ratio)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink/55">{empty}</p>
      )}
    </section>
  );
}

function MetricTile({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs text-ink/55">{label}</p>
      <p className={"mt-1 text-sm font-bold " + valueClass}>{value}</p>
    </div>
  );
}

function compactCurrency(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 10000) {
    return Math.round(value / 1000) + "k";
  }
  return String(Math.round(value));
}

function isEtfPosition(position: Position) {
  return position.industry.toUpperCase().includes("ETF");
}
