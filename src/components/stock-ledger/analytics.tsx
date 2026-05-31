import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currency, percent, profitClass } from "@/lib/format";
import { groupByValue, roundMoney } from "@/lib/calculations";
import type { Portfolio, Position, Stock, Trade } from "@/lib/types";
import { ListSection, PortfolioScopePicker, SmallCard } from "./ui";

const colors = ["#2f7d68", "#c6973f", "#c75b4d", "#4f6f9f", "#7c6a9d", "#61705f"];
const ANALYTICS_COLLAPSE_STORAGE_KEY = "stock-ledger.analytics.collapsed";
const COLLAPSIBLE_CARD_KEYS = ["industry", "tags", "etfEquity", "assets", "concentration", "trend", "behavior", "contribution"] as const;

type TrendWindow = "14d" | "30d";
type ProfitMode = "realized" | "unrealized";
type AnalysisBasis = "marketValue" | "holdingCost";
type ContributionGroup = "stock" | "industry" | "tag";

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
  const [analysisBasis, setAnalysisBasis] = useState<AnalysisBasis>("marketValue");
  const [concentrationVisibleCount, setConcentrationVisibleCount] = useState(5);
  const [profitVisibleCount, setProfitVisibleCount] = useState(5);
  const [contributionGroup, setContributionGroup] = useState<ContributionGroup>("stock");
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    setConcentrationVisibleCount(5);
    setProfitVisibleCount(5);
  }, [tagFilter, analysisBasis, profitMode, selectedPortfolioId, contributionGroup]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(ANALYTICS_COLLAPSE_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      setCollapsedCards(parsed);
    } catch {
      // Ignore malformed localStorage state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYTICS_COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedCards));
  }, [collapsedCards]);

  function toggleCard(key: string) {
    setCollapsedCards((current) => ({ ...current, [key]: !current[key] }));
  }

  function setAllCardsCollapsed(nextCollapsed: boolean) {
    setCollapsedCards(Object.fromEntries(COLLAPSIBLE_CARD_KEYS.map((key) => [key, nextCollapsed])));
  }

  const holdingsValue = filteredPositions.reduce((sum, position) => sum + position.market_value, 0);
  const basisLabel = analysisBasis === "marketValue" ? "持股市值" : "持有成本";
  const holdingsBasisTotal = filteredPositions.reduce((sum, position) => sum + getPositionBasisValue(position, analysisBasis), 0);
  const industryData = groupByValue(filteredPositions, (position) => position.industry, (position) => getPositionBasisValue(position, analysisBasis)).map((item) => ({
    ...item,
    ratio: holdingsBasisTotal > 0 ? item.value / holdingsBasisTotal : 0
  }));
  const tagData = groupByValue(
    filteredPositions.flatMap((position) =>
      position.tags.length
        ? position.tags.map((tag) => ({ tag, value: getPositionBasisValue(position, analysisBasis) }))
        : [{ tag: "未標籤", value: getPositionBasisValue(position, analysisBasis) }]
    ),
    (item) => item.tag,
    (item) => item.value
  ).map((item) => ({
    ...item,
    ratio: holdingsBasisTotal > 0 ? item.value / holdingsBasisTotal : 0
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
  const sortedPositions = useMemo(
    () => [...filteredPositions].sort((a, b) => getPositionBasisValue(b, analysisBasis) - getPositionBasisValue(a, analysisBasis)),
    [filteredPositions, analysisBasis]
  );
  const topPositionRatio = holdingsBasisTotal > 0 ? getPositionBasisValue(sortedPositions[0], analysisBasis) / holdingsBasisTotal : 0;
  const topThreeRatio =
    holdingsBasisTotal > 0
      ? sortedPositions.slice(0, 3).reduce((sum, position) => sum + getPositionBasisValue(position, analysisBasis), 0) / holdingsBasisTotal
      : 0;

  const etfEquityData = useMemo(() => {
    const rows = [
      { name: "ETF", value: 0 },
      { name: "個股", value: 0 }
    ];
    for (const position of filteredPositions) {
      const bucket = isEtfPosition(position) ? rows[0] : rows[1];
      bucket.value = roundMoney(bucket.value + getPositionBasisValue(position, analysisBasis));
    }
    return rows
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        ratio: holdingsBasisTotal > 0 ? item.value / holdingsBasisTotal : 0
      }));
  }, [filteredPositions, holdingsBasisTotal, analysisBasis]);
  const etfRatio = etfEquityData.find((item) => item.name === "ETF")?.ratio ?? 0;
  const industryDetails = useMemo(
    () =>
      buildDetailLookup(
        industryData,
        filteredPositions,
        analysisBasis,
        (name, position) => position.industry === name
      ),
    [industryData, filteredPositions, analysisBasis]
  );
  const tagDetails = useMemo(
    () =>
      buildDetailLookup(
        tagData,
        filteredPositions,
        analysisBasis,
        (name, position) => (name === "未標籤" ? position.tags.length === 0 : position.tags.includes(name))
      ),
    [tagData, filteredPositions, analysisBasis]
  );
  const etfEquityDetails = useMemo(
    () =>
      buildDetailLookup(
        etfEquityData,
        filteredPositions,
        analysisBasis,
        (name, position) => (name === "ETF" ? isEtfPosition(position) : !isEtfPosition(position))
      ),
    [etfEquityData, filteredPositions, analysisBasis]
  );

  const maxGainPosition = useMemo(() => {
    if (!filteredPositions.length) return null;
    return [...filteredPositions].sort((a, b) => b.unrealized_profit - a.unrealized_profit)[0] ?? null;
  }, [filteredPositions]);

  const maxLossPosition = useMemo(() => {
    const losers = filteredPositions.filter((position) => position.unrealized_profit < 0);
    if (!losers.length) return null;
    return [...losers].sort((a, b) => a.unrealized_profit - b.unrealized_profit)[0] ?? null;
  }, [filteredPositions]);

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
      const tradeStockLabel =
        trade.stock?.symbol && trade.stock?.name
          ? `${trade.stock.symbol} ${trade.stock.name}`
          : trade.stock?.name || trade.stock?.symbol || "";
      const mappedStockLabel = stock?.symbol && stock?.name ? `${stock.symbol} ${stock.name}` : stock?.name || stock?.symbol || "";
      const label = tradeStockLabel || mappedStockLabel || (isUuidLike(trade.stock_id) ? "未知標的" : trade.stock_id);
      const current = grouped.get(trade.stock_id) ?? { label, count: 0 };
      current.count += 1;
      if (!current.label || current.label === "未知標的") current.label = label;
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

  const allCardsCollapsed = COLLAPSIBLE_CARD_KEYS.every((key) => collapsedCards[key]);

  const stockProfitRows = useMemo(() => {
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
      .filter((item) => item.realized !== 0 || item.unrealized !== 0)
      .sort((a, b) => (profitMode === "realized" ? b.realized - a.realized : b.unrealized - a.unrealized));
  }, [filteredPositions, profitMode]);

  const contributionRows = useMemo(() => {
    const metricKey = profitMode === "realized" ? "realized" : "unrealized";

    if (contributionGroup === "stock") {
      return stockProfitRows.map((item) => ({
        key: item.key,
        label: item.label,
        value: item[metricKey],
        subtitle: metricKey === "realized" ? `市值 ${currency(item.marketValue)}` : `市值 ${currency(item.marketValue)} · 報酬率 ${percent(item.returnRate)}`
      }));
    }

    if (contributionGroup === "industry") {
      const grouped = new Map<string, { label: string; realized: number; unrealized: number; count: number }>();
      for (const position of filteredPositions) {
        const current = grouped.get(position.industry) ?? {
          label: position.industry,
          realized: 0,
          unrealized: 0,
          count: 0
        };
        current.realized = roundMoney(current.realized + position.realized_profit);
        current.unrealized = roundMoney(current.unrealized + position.unrealized_profit);
        current.count += 1;
        grouped.set(position.industry, current);
      }
      return [...grouped.values()]
        .filter((item) => item.realized !== 0 || item.unrealized !== 0)
        .sort((a, b) => (profitMode === "realized" ? b.realized - a.realized : b.unrealized - a.unrealized))
        .map((item) => ({
          key: item.label,
          label: item.label,
          value: item[metricKey],
          subtitle: `涵蓋 ${item.count} 檔持股`
        }));
    }

    const grouped = new Map<string, { label: string; realized: number; unrealized: number; count: number }>();
    for (const position of filteredPositions) {
      const tags = position.tags.length ? position.tags : ["未標籤"];
      for (const tag of tags) {
        const current = grouped.get(tag) ?? {
          label: tag,
          realized: 0,
          unrealized: 0,
          count: 0
        };
        current.realized = roundMoney(current.realized + position.realized_profit);
        current.unrealized = roundMoney(current.unrealized + position.unrealized_profit);
        current.count += 1;
        grouped.set(tag, current);
      }
    }
    return [...grouped.values()]
      .filter((item) => item.realized !== 0 || item.unrealized !== 0)
      .sort((a, b) => (profitMode === "realized" ? b.realized - a.realized : b.unrealized - a.unrealized))
      .map((item) => ({
        key: item.label,
        label: item.label,
        value: item[metricKey],
        subtitle: `涵蓋 ${item.count} 檔持股`
      }));
  }, [filteredPositions, profitMode, contributionGroup, stockProfitRows]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="mb-3">
          <PortfolioScopePicker
            label="目前："
            value={selectedPortfolioId}
            onChange={onPortfolioChange}
            options={portfolios.map((portfolio) => [portfolio.id, portfolio.name])}
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

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">分析模式</h2>
            <p className="mt-1 text-xs text-ink/50">切換目前配置要以持股市值或持有成本查看</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-md bg-paper p-1 text-sm">
              <button className={"rounded px-3 py-1.5 " + (analysisBasis === "marketValue" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setAnalysisBasis("marketValue")}>
                持股市值
              </button>
              <button className={"rounded px-3 py-1.5 " + (analysisBasis === "holdingCost" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setAnalysisBasis("holdingCost")}>
                持有成本
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-ink/75"
                onClick={() => setAllCardsCollapsed(false)}
              >
                全部展開
              </button>
              <button
                type="button"
                className={"rounded-full border px-3 py-1.5 " + (allCardsCollapsed ? "border-mint/15 bg-mint/5 text-mint" : "border-ink/10 bg-white text-ink/75")}
                onClick={() => setAllCardsCollapsed(true)}
              >
                全部收合
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <SmallCard
          label="最大單一持股"
          value={percent(topPositionRatio)}
          hint={sortedPositions[0] ? `${sortedPositions[0].symbol} ${sortedPositions[0].name}` : "尚無資料"}
        />
        <SmallCard label="前 3 大持股" value={percent(topThreeRatio)} hint="占總持股市值比例" />
        <SmallCard label="最大產業占比" value={percent(topIndustryRatio)} hint={industryData[0]?.name ?? "尚無資料"} />
        <SmallCard
          label="最大獲利部位"
          value={maxGainPosition ? currency(maxGainPosition.unrealized_profit) : "—"}
          valueClass={maxGainPosition ? profitClass(maxGainPosition.unrealized_profit) : ""}
          hint={maxGainPosition ? `${maxGainPosition.symbol} ${maxGainPosition.name}` : "尚無資料"}
        />
        <SmallCard
          label="最大虧損部位"
          value={maxLossPosition ? currency(maxLossPosition.unrealized_profit) : "—"}
          valueClass={maxLossPosition ? profitClass(maxLossPosition.unrealized_profit) : ""}
          hint={maxLossPosition ? `${maxLossPosition.symbol} ${maxLossPosition.name}` : "尚無虧損部位"}
        />
      </section>

      <ChartCard title="產業持股比例" data={industryData} empty="尚無產業配置資料" basisLabel={basisLabel} details={industryDetails} collapsed={collapsedCards.industry ?? false} onToggle={() => toggleCard("industry")} />
      <ChartCard title="標籤持股比例" data={tagData} empty="尚無標籤配置資料" basisLabel={basisLabel} details={tagDetails} collapsed={collapsedCards.tags ?? false} onToggle={() => toggleCard("tags")} />
      <ChartCard title="ETF / 個股配置" data={etfEquityData} empty="尚無配置資料" basisLabel={basisLabel} details={etfEquityDetails} collapsed={collapsedCards.etfEquity ?? false} onToggle={() => toggleCard("etfEquity")} />
      <CollapsibleCard
        title="資產組成"
        subtitle="目前先顯示當前組成，歷史總資產趨勢即將推出。"
        collapsed={collapsedCards.assets ?? false}
        onToggle={() => toggleCard("assets")}
        summary={
          <div className="grid grid-cols-3 gap-2">
            <MetricTile label="現金" value={currency(cash)} />
            <MetricTile label="持股市值" value={currency(holdingsValue)} />
            <MetricTile label="總持股檔數" value={`${filteredPositions.length} 檔`} />
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="現金" value={currency(cash)} />
          <MetricTile label="持股市值" value={currency(holdingsValue)} />
          <MetricTile label="總持股檔數" value={`${filteredPositions.length} 檔`} />
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="持股集中度"
        subtitle="快速看目前部位是否過度集中在少數標的"
        collapsed={collapsedCards.concentration ?? false}
        onToggle={() => toggleCard("concentration")}
        summary={
          <div className="grid grid-cols-3 gap-2">
            <MetricTile label="最大單一持股" value={percent(topPositionRatio)} />
            <MetricTile label="前 3 大持股" value={percent(topThreeRatio)} />
            <MetricTile label="ETF 配置" value={percent(etfRatio)} />
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="最大單一持股" value={percent(topPositionRatio)} />
          <MetricTile label="前 3 大持股" value={percent(topThreeRatio)} />
          <MetricTile label="ETF 配置" value={percent(etfRatio)} />
        </div>
        <div className="mt-3 space-y-2">
          {sortedPositions.slice(0, concentrationVisibleCount).map((position, index) => (
            <div className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-3 text-sm" key={position.stock_id}>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  #{index + 1} {position.symbol} {position.name}
                </p>
                <p className="mt-1 truncate text-ink/55">{currency(getPositionBasisValue(position, analysisBasis))} · {position.industry}</p>
              </div>
              <p className="shrink-0 font-bold">{percent(holdingsBasisTotal > 0 ? getPositionBasisValue(position, analysisBasis) / holdingsBasisTotal : 0)}</p>
            </div>
          ))}
        </div>
        {sortedPositions.length > 5 ? (
          <ExpandControls
            visibleCount={Math.min(concentrationVisibleCount, sortedPositions.length)}
            totalCount={sortedPositions.length}
            onExpandMore={() => setConcentrationVisibleCount((current) => Math.min(current + 5, sortedPositions.length))}
            onExpandAll={() => setConcentrationVisibleCount(sortedPositions.length)}
            onCollapse={() => setConcentrationVisibleCount(5)}
          />
        ) : null}
      </CollapsibleCard>

      <CollapsibleCard
        title="投資趨勢"
        subtitle="比較最近買入、賣出與淨投入變化"
        collapsed={collapsedCards.trend ?? false}
        onToggle={() => toggleCard("trend")}
        summary={
          <div className="grid grid-cols-3 gap-2">
            <MetricTile label="買入" value={currency(trendSummary.buy)} />
            <MetricTile label="賣出" value={currency(trendSummary.sell)} />
            <MetricTile label="淨投入" value={currency(trendSummary.net)} valueClass={profitClass(trendSummary.net)} />
          </div>
        }
      >
        <div className="flex items-center justify-end">
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
      </CollapsibleCard>

      <CollapsibleCard
        title="交易行為摘要"
        subtitle="依目前時間區間彙整最近的操作密度與交易習慣"
        collapsed={collapsedCards.behavior ?? false}
        onToggle={() => toggleCard("behavior")}
        summary={
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="買入次數" value={`${tradeBehavior.buyCount} 次`} />
            <MetricTile label="賣出次數" value={`${tradeBehavior.sellCount} 次`} />
            <MetricTile label="平均單筆買入" value={currency(tradeBehavior.avgBuyAmount)} />
            <MetricTile label="最常交易標的" value={tradeBehavior.mostTradedCount ? `${tradeBehavior.mostTradedCount} 次` : "0 次"} />
          </div>
        }
      >
        <div className="flex items-center justify-between gap-3">
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
      </CollapsibleCard>

      <CollapsibleCard
        title="損益貢獻分析"
        subtitle="依股票、產業或標籤查看目前主要的獲利與虧損來源"
        collapsed={collapsedCards.contribution ?? false}
        onToggle={() => toggleCard("contribution")}
        summary={
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="模式" value={profitMode === "realized" ? "已實現" : "未實現"} />
            <MetricTile
              label="目前維度"
              value={contributionGroup === "stock" ? "股票" : contributionGroup === "industry" ? "產業" : "標籤"}
            />
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md bg-paper p-1 text-sm">
            <button className={"rounded px-3 py-1.5 " + (profitMode === "unrealized" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setProfitMode("unrealized")}>
              未實現
            </button>
            <button className={"rounded px-3 py-1.5 " + (profitMode === "realized" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setProfitMode("realized")}>
              已實現
            </button>
          </div>
          <div className="rounded-md bg-paper p-1 text-sm">
            <button className={"rounded px-3 py-1.5 " + (contributionGroup === "stock" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setContributionGroup("stock")}>
              股票
            </button>
            <button className={"rounded px-3 py-1.5 " + (contributionGroup === "industry" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setContributionGroup("industry")}>
              產業
            </button>
            <button className={"rounded px-3 py-1.5 " + (contributionGroup === "tag" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setContributionGroup("tag")}>
              標籤
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {contributionRows.slice(0, profitVisibleCount).map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.label}</p>
                <p className="mt-1 truncate text-sm text-ink/55">{item.subtitle}</p>
              </div>
              <p className={"shrink-0 text-sm font-bold " + profitClass(item.value)}>{currency(item.value)}</p>
            </div>
          ))}
        </div>
        {contributionRows.length > 5 ? (
          <ExpandControls
            visibleCount={Math.min(profitVisibleCount, contributionRows.length)}
            totalCount={contributionRows.length}
            onExpandMore={() => setProfitVisibleCount((current) => Math.min(current + 5, contributionRows.length))}
            onExpandAll={() => setProfitVisibleCount(contributionRows.length)}
            onCollapse={() => setProfitVisibleCount(5)}
          />
        ) : null}
      </CollapsibleCard>
    </div>
  );
}

function ChartCard({
  title,
  data,
  empty,
  basisLabel,
  details,
  collapsed,
  onToggle
}: {
  title: string;
  data: { name: string; value: number; ratio: number }[];
  empty: string;
  basisLabel: string;
  details: Record<string, DetailPositionRow[]>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [selectedName, setSelectedName] = useState<string>(data[0]?.name ?? "");
  const [visibleCount, setVisibleCount] = useState(5);
  const [detailVisibleCount, setDetailVisibleCount] = useState(5);

  useEffect(() => {
    setSelectedName(data[0]?.name ?? "");
    setVisibleCount(5);
    setDetailVisibleCount(5);
  }, [data]);

  useEffect(() => {
    setDetailVisibleCount(5);
  }, [selectedName]);

  const selectedItem = data.find((item) => item.name === selectedName) ?? data[0];
  const selectedDetails = selectedItem ? details[selectedItem.name] ?? [] : [];
  return (
    <CollapsibleCard
      title={title}
      subtitle={`依目前範圍計算 ${basisLabel} 占比`}
      collapsed={collapsed}
      onToggle={onToggle}
      summary={
        selectedItem ? (
          <div className="grid grid-cols-3 gap-2">
            <MetricTile label="最大分類" value={selectedItem.name} />
            <MetricTile label={basisLabel} value={currency(selectedItem.value)} />
            <MetricTile label="配置占比" value={percent(selectedItem.ratio)} />
          </div>
        ) : (
          <p className="text-sm text-ink/55">{empty}</p>
        )
      }
    >
      <div className="flex items-center justify-end">
        <div className="rounded-full bg-paper px-3 py-1 text-xs font-semibold tabular-nums text-ink/55">{data.length} 類</div>
      </div>
      {data.length ? (
        <>
          <div className="mt-4 rounded-xl bg-paper/55 px-4 py-5">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={92}
                    paddingAngle={3}
                    stroke="#f7f4ee"
                    strokeWidth={3}
                    onClick={(_, index) => setSelectedName(data[index]?.name ?? "")}
                  >
                    {data.map((entry, index) => (
                      <Cell key={entry.name} fill={colors[index % colors.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          {selectedItem ? (
            <div className="mt-4 rounded-2xl border border-mint/15 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{selectedItem.name}</p>
                  <p className="mt-1 text-xs text-ink/45">目前選取扇區明細</p>
                </div>
                <span className="rounded-full bg-mint/10 px-3 py-1.5 text-sm font-bold tabular-nums text-mint">{percent(selectedItem.ratio)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricTile label={basisLabel} value={currency(selectedItem.value)} />
                <MetricTile label="配置占比" value={percent(selectedItem.ratio)} />
              </div>
              {selectedDetails.length ? (
                <div className="mt-4 rounded-xl border border-ink/8 bg-paper/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">對應持股資訊</p>
                    <p className="text-xs text-ink/45">共 {selectedDetails.length} 檔</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedDetails.slice(0, detailVisibleCount).map((detail) => (
                      <div key={detail.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {detail.symbol} {detail.name}
                          </p>
                          <p className="mt-1 truncate text-xs text-ink/45">
                            {detail.quantityText} · {basisLabel} {currency(detail.basisValue)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-ink">{currency(detail.marketValue)}</p>
                          <p className={"mt-1 text-xs font-semibold " + profitClass(detail.unrealizedProfit)}>{currency(detail.unrealizedProfit)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedDetails.length > 5 ? (
                    <ExpandControls
                      visibleCount={Math.min(detailVisibleCount, selectedDetails.length)}
                      totalCount={selectedDetails.length}
                      onExpandMore={() => setDetailVisibleCount((current) => Math.min(current + 5, selectedDetails.length))}
                      onExpandAll={() => setDetailVisibleCount(selectedDetails.length)}
                      onCollapse={() => setDetailVisibleCount(5)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {data.slice(0, visibleCount).map((item, index) => (
              <button
                type="button"
                className={
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm shadow-[0_1px_0_rgba(10,10,10,0.02)] " +
                  (selectedItem?.name === item.name ? "border-mint/20 bg-mint/5" : "border-ink/5 bg-white")
                }
                key={item.name}
                onClick={() => setSelectedName(item.name)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{item.name}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-ink/45">{currency(item.value)}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-right text-[13px] font-semibold tabular-nums text-ink">{percent(item.ratio)}</span>
              </button>
            ))}
          </div>
          {data.length > 5 ? (
            <ExpandControls
              visibleCount={Math.min(visibleCount, data.length)}
              totalCount={data.length}
              onExpandMore={() => setVisibleCount((current) => Math.min(current + 5, data.length))}
              onExpandAll={() => setVisibleCount(data.length)}
              onCollapse={() => setVisibleCount(5)}
            />
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-ink/55">{empty}</p>
      )}
    </CollapsibleCard>
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

function ExpandControls({
  visibleCount,
  totalCount,
  onExpandMore,
  onExpandAll,
  onCollapse
}: {
  visibleCount: number;
  totalCount: number;
  onExpandMore: () => void;
  onExpandAll: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-ink/8 bg-paper/60 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink/55">目前顯示 {visibleCount} / {totalCount} 項</p>
        <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
          {visibleCount < totalCount ? (
            <>
              <button className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-ink/75" onClick={onExpandMore}>
                繼續展開 5 項
              </button>
              <button className="rounded-full border border-mint/15 bg-mint/5 px-3 py-1.5 text-mint" onClick={onExpandAll}>
                全部展開
              </button>
            </>
          ) : (
            <button className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-ink/75" onClick={onCollapse}>
              收合
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsibleCard({
  title,
  subtitle,
  collapsed,
  onToggle,
  summary,
  children
}: {
  title: string;
  subtitle: string;
  collapsed: boolean;
  onToggle: () => void;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-xs text-ink/50">{subtitle}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-ink/10 bg-paper p-2 text-ink/65"
          aria-label={collapsed ? `展開${title}` : `收合${title}`}
          onClick={onToggle}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {collapsed ? <div className="mt-4">{summary}</div> : <div className="mt-4">{children}</div>}
    </section>
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
  const industry = position.industry.toUpperCase();
  const name = position.name.toUpperCase();
  if (industry.includes("ETF") || name.includes("ETF")) return true;
  return /^00\d{2,3}$/.test(position.symbol);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getPositionBasisValue(position: Position | undefined, basis: AnalysisBasis) {
  if (!position) return 0;
  return basis === "marketValue" ? position.market_value : position.holding_cost;
}

type DetailPositionRow = {
  key: string;
  symbol: string;
  name: string;
  quantityText: string;
  basisValue: number;
  marketValue: number;
  unrealizedProfit: number;
};

function buildDetailLookup(
  groups: { name: string }[],
  positions: Position[],
  basis: AnalysisBasis,
  matcher: (name: string, position: Position) => boolean
) {
  const lookup: Record<string, DetailPositionRow[]> = {};
  for (const group of groups) {
    lookup[group.name] = positions
      .filter((position) => matcher(group.name, position))
      .sort((a, b) => getPositionBasisValue(b, basis) - getPositionBasisValue(a, basis))
      .map((position) => ({
        key: position.stock_id,
        symbol: position.symbol,
        name: position.name,
        quantityText: `${position.quantity} 股`,
        basisValue: getPositionBasisValue(position, basis),
        marketValue: position.market_value,
        unrealizedProfit: position.unrealized_profit
      }));
  }
  return lookup;
}
