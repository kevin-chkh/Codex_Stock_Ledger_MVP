import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { currency, percent, profitClass } from "@/lib/format";
import { compareTradesChronologically, groupByValue, roundMoney } from "@/lib/calculations";
import type { Portfolio, Position, Stock, Trade } from "@/lib/types";
import { PortfolioScopePicker, Segmented, SmallCard } from "./ui";

const colors = ["#2f7d68", "#c6973f", "#c75b4d", "#4f6f9f", "#7c6a9d", "#61705f"];
const ANALYTICS_COLLAPSE_STORAGE_KEY = "stock-ledger.analytics.collapsed";
const ANALYTICS_VIEW_MODE_STORAGE_KEY = "stock-ledger.analytics.viewMode";
const COLLAPSIBLE_CARD_KEYS = ["industry", "tags", "etfEquity", "assets", "concentration", "trend", "contribution"] as const;
const realizedWindowLabelMap: Record<RealizedWindow, string> = {
  "1m": "近一月",
  "3m": "近三月",
  "6m": "近半年",
  "1y": "近一年",
  all: "全部"
};

type TrendWindow = "14d" | "30d";
type ProfitMode = "realized" | "unrealized";
type AnalysisBasis = "marketValue" | "holdingCost";
type ContributionGroup = "stock" | "industry" | "tag";
type AnalyticsViewMode = "simple" | "full";
type RealizedWindow = "1m" | "3m" | "6m" | "1y" | "all";

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
  const [analysisBasis, setAnalysisBasis] = useState<AnalysisBasis>("holdingCost");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("simple");
  const [realizedWindow, setRealizedWindow] = useState<RealizedWindow>("1y");
  const [concentrationVisibleCount, setConcentrationVisibleCount] = useState(5);
  const [profitVisibleCount, setProfitVisibleCount] = useState(5);
  const [contributionGroup, setContributionGroup] = useState<ContributionGroup>("stock");
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const [expandedContributionKeys, setExpandedContributionKeys] = useState<Record<string, boolean>>({});
  const [expandedHoldingKeys, setExpandedHoldingKeys] = useState<Record<string, boolean>>({});

  const openPositions = useMemo(() => positions.filter((position) => position.quantity > 0), [positions]);
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    positions.forEach((position) => position.tags.forEach((tag) => tags.add(tag)));
    return [...tags].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [positions]);

  const filteredPositions = useMemo(
    () => (tagFilter === "all" ? openPositions : openPositions.filter((position) => position.tags.includes(tagFilter))),
    [openPositions, tagFilter]
  );
  const filteredProfitPositions = useMemo(
    () => (tagFilter === "all" ? positions : positions.filter((position) => position.tags.includes(tagFilter))),
    [positions, tagFilter]
  );
  const profitPositionByStockId = useMemo(() => {
    const map = new Map<string, Position>();
    for (const position of filteredProfitPositions) {
      const current = map.get(position.stock_id);
      if (!current) {
        map.set(position.stock_id, position);
        continue;
      }
      if (position.quantity > 0 && current.quantity <= 0) {
        map.set(position.stock_id, position);
      }
    }
    return map;
  }, [filteredProfitPositions]);

  useEffect(() => {
    setConcentrationVisibleCount(5);
    setProfitVisibleCount(5);
    setExpandedContributionKeys({});
    setExpandedHoldingKeys({});
  }, [tagFilter, analysisBasis, profitMode, selectedPortfolioId, contributionGroup, realizedWindow]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedViewMode = window.localStorage.getItem(ANALYTICS_VIEW_MODE_STORAGE_KEY);
      if (savedViewMode === "simple" || savedViewMode === "full") setViewMode(savedViewMode);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYTICS_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  function toggleCard(key: string) {
    setCollapsedCards((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleContributionRow(key: string) {
    setExpandedContributionKeys((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleHoldingRow(key: string) {
    setExpandedHoldingKeys((current) => ({ ...current, [key]: !current[key] }));
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
  const concentrationStatus =
    topThreeRatio > 0.6
      ? { label: "集中度偏高", tone: "text-[#d45c4a]", note: "前 3 大持股占比超過 60%" }
      : topThreeRatio >= 0.4
        ? { label: "中等集中", tone: "text-[#c6973f]", note: "前 3 大持股占比介於 40% 到 60%" }
        : { label: "相對分散", tone: "text-mint", note: "前 3 大持股占比低於 40%" };

  const etfEquityData = useMemo(() => {
    const rows = [
      { name: "ETF", value: 0, holdingCost: 0, marketValue: 0, estimatedProfit: 0 },
      { name: "個股", value: 0, holdingCost: 0, marketValue: 0, estimatedProfit: 0 }
    ];
    const sourcePositions = filteredPositions;
    for (const position of sourcePositions) {
      const bucket = isEtfPosition(position) ? rows[0] : rows[1];
      bucket.value = roundMoney(bucket.value + getPositionBasisValue(position, analysisBasis));
      bucket.holdingCost = roundMoney(bucket.holdingCost + position.holding_cost);
      bucket.marketValue = roundMoney(bucket.marketValue + position.market_value);
      bucket.estimatedProfit = roundMoney(bucket.estimatedProfit + position.estimated_profit);
    }
    return rows
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        ratio: holdingsBasisTotal > 0 ? item.value / holdingsBasisTotal : 0,
        returnRate: item.holdingCost > 0 ? item.estimatedProfit / item.holdingCost : 0
      }));
  }, [filteredPositions, holdingsBasisTotal, analysisBasis]);
  const etfRatio = etfEquityData.find((item) => item.name === "ETF")?.ratio ?? 0;
  const industryDetails = useMemo(
    () => buildDetailLookup(industryData, filteredPositions, analysisBasis, (name, position) => position.industry === name),
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
    return [...filteredPositions].sort((a, b) => b.estimated_profit - a.estimated_profit)[0] ?? null;
  }, [filteredPositions]);

  const maxLossPosition = useMemo(() => {
    const losers = filteredPositions.filter((position) => position.estimated_profit < 0);
    if (!losers.length) return null;
    return [...losers].sort((a, b) => a.estimated_profit - b.estimated_profit)[0] ?? null;
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
  const trendWindowLabel = trendWindow === "14d" ? "近 2 週" : "近 1 個月";
  const recentTradeCount = tradeBehavior.buyCount + tradeBehavior.sellCount;

  const allCardsCollapsed = COLLAPSIBLE_CARD_KEYS.every((key) => collapsedCards[key]);

  const latestSellDate = useMemo(() => {
    const sellTrades = trades.filter((trade) => trade.type === "sell");
    if (!sellTrades.length) return latestTradeDate;
    return sellTrades.reduce((latest, trade) => {
      const current = new Date(trade.traded_at + "T00:00:00");
      return current.getTime() > latest.getTime() ? current : latest;
    }, new Date(sellTrades[0].traded_at + "T00:00:00"));
  }, [latestTradeDate, trades]);

  const realizedStartKey = useMemo(() => getRealizedStartKey(realizedWindow, latestSellDate), [latestSellDate, realizedWindow]);
  const realizedWindowLabel = realizedWindowLabelMap[realizedWindow];

  const realizedStockRows = useMemo(() => {
    const stateByKey = new Map<string, { quantity: number; cost: number }>();
    const grouped = new Map<
      string,
      {
        key: string;
        label: string;
        realized: number;
        soldCost: number;
        details: ContributionDetailRow[];
        tags: string[];
        industry: string;
        isEtf: boolean;
      }
    >();

    for (const trade of [...trades].sort(compareTradesChronologically)) {
      const key = `${trade.portfolio_id}:${trade.stock_id}`;
      const state = stateByKey.get(key) ?? { quantity: 0, cost: 0 };

      if (trade.type === "buy") {
        state.quantity = roundMoney(state.quantity + trade.quantity);
        state.cost = roundMoney(state.cost + trade.net_amount);
        stateByKey.set(key, state);
        continue;
      }

      const averageCost = state.quantity > 0 ? state.cost / state.quantity : 0;
      const soldCost = roundMoney(averageCost * trade.quantity);
      const profit = roundMoney(trade.net_amount - soldCost);
      state.quantity = roundMoney(state.quantity - trade.quantity);
      state.cost = roundMoney(state.cost - soldCost);
      stateByKey.set(key, state);
      if (realizedStartKey && trade.traded_at < realizedStartKey) continue;

      const meta = profitPositionByStockId.get(trade.stock_id);
      const symbol = meta?.symbol || trade.stock?.symbol || "";
      const name = meta?.name || trade.stock?.name || symbol;
      const industry = meta?.industry || "未分類";
      const tags = meta?.tags ?? [];
      const isEtf = meta ? isEtfPosition(meta) : isEtfMeta(symbol, name, industry);
      const current = grouped.get(trade.stock_id) ?? {
        key: trade.stock_id,
        label: `${symbol} ${name}`.trim(),
        realized: 0,
        soldCost: 0,
        details: [],
        tags,
        industry,
        isEtf
      };
      current.realized = roundMoney(current.realized + profit);
      current.soldCost = roundMoney(current.soldCost + soldCost);
      current.tags = current.tags.length ? current.tags : tags;
      current.industry = current.industry || industry;
      current.details.push({
        key: trade.id,
        symbol,
        name,
        metricValue: profit,
        returnRate: soldCost > 0 ? profit / soldCost : 0,
        quantityText: `${trade.quantity} 股`,
        costText: currency(soldCost),
        shareText: ""
      });
      grouped.set(trade.stock_id, current);
    }

    const rows = [...grouped.values()]
      .filter((item) => item.realized !== 0)
      .sort((a, b) => b.realized - a.realized)
      .map((item) => ({
        key: item.key,
        label: item.label,
        value: item.realized,
        returnRate: item.soldCost > 0 ? item.realized / item.soldCost : 0,
        ratio: 0,
        subtitle: `已賣出成本 ${currency(item.soldCost)}`,
        details: item.details
          .sort((a, b) => b.metricValue - a.metricValue)
          .map((detail) => ({
            ...detail,
            shareText: Math.abs(item.realized) > 0 ? `佔此標的 ${percent(Math.abs(detail.metricValue) / Math.abs(item.realized))}` : "佔此標的 0.00%"
          })),
        tags: item.tags,
        industry: item.industry,
        isEtf: item.isEtf,
        soldCost: item.soldCost
      }));

    if (tagFilter === "all") return rows;
    return rows.filter((item) => (item.tags.length ? item.tags.includes(tagFilter) : tagFilter === "未標籤"));
  }, [profitPositionByStockId, realizedStartKey, tagFilter, trades]);

  const realizedCategoryRows = useMemo(() => {
    const rows = [
      { name: "ETF", realized: 0, soldCost: 0, count: 0 },
      { name: "個股", realized: 0, soldCost: 0, count: 0 }
    ];
    for (const row of realizedStockRows) {
      const bucket = row.isEtf ? rows[0] : rows[1];
      bucket.realized = roundMoney(bucket.realized + row.value);
      bucket.soldCost = roundMoney(bucket.soldCost + row.soldCost);
      bucket.count += 1;
    }
    return rows.map((row) => ({
      ...row,
      returnRate: row.soldCost > 0 ? row.realized / row.soldCost : 0
    }));
  }, [realizedStockRows]);

  const realizedSummary = useMemo(
    () =>
      realizedCategoryRows.reduce(
        (acc, row) => ({
          realized: roundMoney(acc.realized + row.realized),
          soldCost: roundMoney(acc.soldCost + row.soldCost),
          count: acc.count + row.count
        }),
        { realized: 0, soldCost: 0, count: 0 }
      ),
    [realizedCategoryRows]
  );

  const stockProfitRows = useMemo(() => {
    if (profitMode === "realized") {
      return realizedStockRows.map((item) => ({
        key: item.key,
        label: item.label,
        realized: item.value,
        unrealized: 0,
        returnRate: item.returnRate,
        marketValue: 0,
        basisValue: item.soldCost,
        details: item.details
      }));
    }
    const sourcePositions = filteredPositions;
    const grouped = new Map<
      string,
      {
        key: string;
        label: string;
        realized: number;
        unrealized: number;
        returnRate: number;
        marketValue: number;
        basisValue: number;
        details: ContributionDetailRow[];
      }
    >();

    for (const position of sourcePositions) {
      const returnBasis = position.holding_cost;
      const metricValue = position.estimated_profit;
      const current = grouped.get(position.stock_id) ?? {
        key: position.stock_id,
        label: position.symbol + " " + position.name,
        realized: 0,
        unrealized: 0,
        returnRate: 0,
        marketValue: 0,
        basisValue: 0,
        details: []
      };
      current.realized = roundMoney(current.realized + position.realized_profit);
      current.unrealized = roundMoney(current.unrealized + position.estimated_profit);
      current.marketValue = roundMoney(current.marketValue + position.market_value);
      current.basisValue = roundMoney(current.basisValue + returnBasis);
      current.returnRate = current.basisValue > 0 ? current.unrealized / current.basisValue : 0;
      current.details = [
        {
          key: position.stock_id,
          symbol: position.symbol,
          name: position.name,
          metricValue,
          returnRate: returnBasis > 0 ? metricValue / returnBasis : 0,
          quantityText: `${position.quantity} 股`,
          costText: currency(position.holding_cost),
          shareText: "單一標的"
        }
      ];
      grouped.set(position.stock_id, current);
    }

    return [...grouped.values()]
      .filter((item) => item.realized !== 0 || item.unrealized !== 0)
      .sort((a, b) => b.unrealized - a.unrealized);
  }, [filteredPositions, realizedStockRows]);

  const contributionRows = useMemo(() => {
    const metricKey = profitMode === "realized" ? "realized" : "unrealized";
    const sourcePositions = profitMode === "realized" ? filteredProfitPositions : filteredPositions;
    const totalContribution = (rows: { value: number }[]) => rows.reduce((sum, item) => sum + Math.abs(item.value), 0);

    if (contributionGroup === "stock") {
      const rows = stockProfitRows.map((item) => ({
        key: item.key,
        label: item.label,
        value: item[metricKey],
        returnRate: item.returnRate,
        ratio: 0,
        subtitle: profitMode === "realized" ? `已賣出成本 ${currency(item.basisValue)}` : `市值 ${currency(item.marketValue)}`,
        details: item.details
      }));
      const contributionTotal = totalContribution(rows);
      return rows.map((item) => ({
        ...item,
        ratio: contributionTotal > 0 ? Math.abs(item.value) / contributionTotal : 0
      }));
    }

    if (contributionGroup === "industry") {
      if (profitMode === "realized") {
        const grouped = new Map<string, { key: string; label: string; value: number; soldCost: number; details: ContributionDetailRow[]; count: number }>();
        for (const row of realizedStockRows) {
          const meta = profitPositionByStockId.get(row.key);
          const label = meta?.industry || row.industry || "未分類";
          const current = grouped.get(label) ?? { key: label, label, value: 0, soldCost: 0, details: [], count: 0 };
          current.value = roundMoney(current.value + row.value);
          current.soldCost = roundMoney(current.soldCost + sumContributionSoldCost(row.details));
          current.details.push(
            ...row.details.map((detail) => ({
              ...detail,
              symbol: row.label.split(" ")[0] || detail.symbol,
              name: row.label.replace((row.label.split(" ")[0] || "") + " ", "") || detail.name
            }))
          );
          current.count += 1;
          grouped.set(label, current);
        }
        const rows = [...grouped.values()]
          .filter((item) => item.value !== 0)
          .sort((a, b) => b.value - a.value)
          .map((item) => ({
            key: item.key,
            label: item.label,
            value: item.value,
            returnRate: item.soldCost > 0 ? item.value / item.soldCost : 0,
            ratio: 0,
            subtitle: `涵蓋 ${item.count} 檔已賣出股票`,
            details: item.details
              .sort((a, b) => b.metricValue - a.metricValue)
              .map((detail) => ({
                ...detail,
                shareText: Math.abs(item.value) > 0 ? `佔此類別 ${percent(Math.abs(detail.metricValue) / Math.abs(item.value))}` : "佔此類別 0.00%"
              }))
          }));
        const contributionTotal = totalContribution(rows);
        return rows.map((item) => ({ ...item, ratio: contributionTotal > 0 ? Math.abs(item.value) / contributionTotal : 0 }));
      }
      const grouped = new Map<string, { label: string; realized: number; unrealized: number; count: number; basisValue: number; details: ContributionDetailRow[] }>();
      for (const position of sourcePositions) {
        const metricValue = position.estimated_profit;
        const basisValue = position.holding_cost;
        const current = grouped.get(position.industry) ?? {
          label: position.industry,
          realized: 0,
          unrealized: 0,
          count: 0,
          basisValue: 0,
          details: []
        };
        current.realized = roundMoney(current.realized + position.realized_profit);
        current.unrealized = roundMoney(current.unrealized + position.estimated_profit);
        current.basisValue = roundMoney(current.basisValue + basisValue);
        current.count += 1;
        current.details.push({
          key: position.stock_id,
          symbol: position.symbol,
          name: position.name,
          metricValue,
          returnRate: basisValue > 0 ? metricValue / basisValue : 0,
          quantityText: `${position.quantity} 股`,
          costText: currency(position.holding_cost),
          shareText: ""
        });
        grouped.set(position.industry, current);
      }
      const rows = [...grouped.values()]
        .filter((item) => item.realized !== 0 || item.unrealized !== 0)
        .sort((a, b) => b.unrealized - a.unrealized)
        .map((item) => {
          const value = item.unrealized;
          return {
            key: item.label,
            label: item.label,
            value,
            returnRate: item.basisValue > 0 ? value / item.basisValue : 0,
            ratio: 0,
            subtitle: `涵蓋 ${item.count} 檔持股`,
            details: item.details
              .sort((a, b) => b.metricValue - a.metricValue)
              .map((detail) => ({
                ...detail,
                shareText: Math.abs(value) > 0 ? `佔此類別 ${percent(Math.abs(detail.metricValue) / Math.abs(value))}` : "佔此類別 0.00%"
              }))
          };
        });
      const contributionTotal = totalContribution(rows);
      return rows.map((item) => ({ ...item, ratio: contributionTotal > 0 ? Math.abs(item.value) / contributionTotal : 0 }));
    }

    if (profitMode === "realized") {
      const grouped = new Map<string, { key: string; label: string; value: number; soldCost: number; details: ContributionDetailRow[]; count: number }>();
      for (const row of realizedStockRows) {
        const tags = row.tags.length ? row.tags : ["未標籤"];
        for (const tag of tags) {
          const current = grouped.get(tag) ?? { key: tag, label: tag, value: 0, soldCost: 0, details: [], count: 0 };
          current.value = roundMoney(current.value + row.value);
          current.soldCost = roundMoney(current.soldCost + sumContributionSoldCost(row.details));
          current.details.push(...row.details);
          current.count += 1;
          grouped.set(tag, current);
        }
      }
      const rows = [...grouped.values()]
        .filter((item) => item.value !== 0)
        .sort((a, b) => b.value - a.value)
        .map((item) => ({
          key: item.key,
          label: item.label,
          value: item.value,
          returnRate: item.soldCost > 0 ? item.value / item.soldCost : 0,
          ratio: 0,
          subtitle: `涵蓋 ${item.count} 檔已賣出股票`,
          details: item.details
            .sort((a, b) => b.metricValue - a.metricValue)
            .map((detail) => ({
              ...detail,
              shareText: Math.abs(item.value) > 0 ? `佔此標籤 ${percent(Math.abs(detail.metricValue) / Math.abs(item.value))}` : "佔此標籤 0.00%"
            }))
        }));
      const contributionTotal = totalContribution(rows);
      return rows.map((item) => ({ ...item, ratio: contributionTotal > 0 ? Math.abs(item.value) / contributionTotal : 0 }));
    }

    const grouped = new Map<string, { label: string; realized: number; unrealized: number; count: number; basisValue: number; details: ContributionDetailRow[] }>();
    for (const position of sourcePositions) {
      const metricValue = position.estimated_profit;
      const basisValue = position.holding_cost;
      const tags = position.tags.length ? position.tags : ["未標籤"];
      for (const tag of tags) {
        const current = grouped.get(tag) ?? {
          label: tag,
          realized: 0,
          unrealized: 0,
          count: 0,
          basisValue: 0,
          details: []
        };
        current.realized = roundMoney(current.realized + position.realized_profit);
        current.unrealized = roundMoney(current.unrealized + position.estimated_profit);
        current.basisValue = roundMoney(current.basisValue + basisValue);
        current.count += 1;
        current.details.push({
          key: `${position.stock_id}:${tag}`,
          symbol: position.symbol,
          name: position.name,
          metricValue,
          returnRate: basisValue > 0 ? metricValue / basisValue : 0,
          quantityText: `${position.quantity} 股`,
          costText: currency(position.holding_cost),
          shareText: ""
        });
        grouped.set(tag, current);
      }
    }
    const rows = [...grouped.values()]
      .filter((item) => item.realized !== 0 || item.unrealized !== 0)
      .sort((a, b) => b.unrealized - a.unrealized)
      .map((item) => {
        const value = item.unrealized;
        return {
          key: item.label,
          label: item.label,
          value,
          returnRate: item.basisValue > 0 ? value / item.basisValue : 0,
          ratio: 0,
          subtitle: `涵蓋 ${item.count} 檔持股`,
          details: item.details
            .sort((a, b) => b.metricValue - a.metricValue)
            .map((detail) => ({
              ...detail,
              shareText: Math.abs(value) > 0 ? `佔此標籤 ${percent(Math.abs(detail.metricValue) / Math.abs(value))}` : "佔此標籤 0.00%"
            }))
        };
      });
    const contributionTotal = totalContribution(rows);
    return rows.map((item) => ({ ...item, ratio: contributionTotal > 0 ? Math.abs(item.value) / contributionTotal : 0 }));
  }, [analysisBasis, filteredPositions, filteredProfitPositions, profitMode, contributionGroup, stockProfitRows, realizedStockRows, profitPositionByStockId]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="mb-3">
          <PortfolioScopePicker
            label="目前："
            value={selectedPortfolioId}
            onChange={onPortfolioChange}
            options={[["all", "全部帳本"], ...portfolios.map((portfolio) => [portfolio.id, portfolio.name])]}
          />
        </div>
        <div className="mb-3">
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as AnalyticsViewMode)}
            options={[
              ["simple", "精簡"],
              ["full", "完整"]
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

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold">分析模式</h2>
            <p className="mt-1 text-xs text-ink/50">切換目前配置要以持股市值或持有成本查看</p>
          </div>
          <div className="space-y-2 sm:min-w-[240px]">
            <div className="rounded-md bg-paper p-1 text-sm">
              <button className={"rounded px-3 py-1.5 " + (analysisBasis === "marketValue" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setAnalysisBasis("marketValue")}>
                持股市值
              </button>
              <button className={"rounded px-3 py-1.5 " + (analysisBasis === "holdingCost" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setAnalysisBasis("holdingCost")}>
                持有成本
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-paper/70 px-3 py-2">
              <p className="text-xs font-medium text-ink/55">區塊檢視</p>
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
        </div>
      </section>

      {viewMode === "full" ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="font-bold">風險集中度</h2>
              <p className="mt-1 text-xs text-ink/50">先看部位是否集中在少數股票或產業</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SmallCard
                label="最大單一持股"
                value={percent(topPositionRatio)}
                hint={sortedPositions[0] ? `${sortedPositions[0].symbol} ${sortedPositions[0].name}` : "尚無資料"}
              />
              <SmallCard label="前 3 大持股" value={percent(topThreeRatio)} hint="占總持股市值比例" />
              <SmallCard label="最大產業占比" value={percent(topIndustryRatio)} hint={industryData[0]?.name ?? "尚無資料"} />
              <SmallCard label="集中度狀態" value={concentrationStatus.label} valueClass={concentrationStatus.tone} hint={concentrationStatus.note} />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="font-bold">損益焦點</h2>
              <p className="mt-1 text-xs text-ink/50">快速定位目前最大貢獻與最大拖累</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SmallCard
                label="最大獲利部位"
                value={maxGainPosition ? currency(maxGainPosition.estimated_profit) : "—"}
                valueClass={maxGainPosition ? profitClass(maxGainPosition.estimated_profit) : ""}
                hint={maxGainPosition ? `${maxGainPosition.symbol} ${maxGainPosition.name}` : "尚無資料"}
              />
              <SmallCard
                label="最大虧損部位"
                value={maxLossPosition ? currency(maxLossPosition.estimated_profit) : "—"}
                valueClass={maxLossPosition ? profitClass(maxLossPosition.estimated_profit) : ""}
                hint={maxLossPosition ? `${maxLossPosition.symbol} ${maxLossPosition.name}` : "尚無虧損部位"}
              />
            </div>
          </section>
        </>
      ) : null}

      <ChartCard title="產業持股比例" data={industryData} empty="尚無產業配置資料" basisLabel={basisLabel} details={industryDetails} collapsed={collapsedCards.industry ?? false} onToggle={() => toggleCard("industry")} />
      {viewMode === "full" ? (
        <>
          <RatioListCard title="標籤持股比例" data={tagData} empty="尚無標籤配置資料" basisLabel={basisLabel} details={tagDetails} collapsed={collapsedCards.tags ?? false} onToggle={() => toggleCard("tags")} />
          <AllocationBarCard title="ETF / 個股配置" data={etfEquityData} empty="尚無配置資料" basisLabel={basisLabel} details={etfEquityDetails} collapsed={collapsedCards.etfEquity ?? false} onToggle={() => toggleCard("etfEquity")} />
        </>
      ) : null}
      <CollapsibleCard
        title="損益貢獻分析"
        subtitle="依股票、產業或標籤查看目前主要的獲利與虧損來源"
        collapsed={collapsedCards.contribution ?? false}
        onToggle={() => toggleCard("contribution")}
        summary={
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="模式" value={profitMode === "realized" ? "已實現" : "預估"} />
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
              預估
            </button>
            <button className={"rounded px-3 py-1.5 " + (profitMode === "realized" ? "bg-white font-semibold text-mint shadow-sm" : "text-ink/55")} onClick={() => setProfitMode("realized")}>
              已實現
            </button>
          </div>
          {profitMode === "realized" ? (
            <>
              <Segmented
                value={realizedWindow}
                onChange={(value) => setRealizedWindow(value as RealizedWindow)}
                options={[
                  ["1y", "近一年"],
                  ["6m", "近半年"],
                  ["3m", "近三月"],
                  ["1m", "近一月"],
                  ["all", "全部"]
                ]}
              />
              <div className="rounded-xl border border-ink/8 bg-paper/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">已實現損益摘要</p>
                    <p className="mt-1 text-xs text-ink/50">{realizedWindowLabel} · 依 ETF / 個股拆分</p>
                  </div>
                  <div className="text-right">
                    <p className={"text-sm font-bold " + profitClass(realizedSummary.realized)}>{currency(realizedSummary.realized)}</p>
                    <p className={"mt-1 text-xs " + profitClass(realizedSummary.realized)}>
                      報酬率 {percent(realizedSummary.soldCost > 0 ? realizedSummary.realized / realizedSummary.soldCost : 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {realizedCategoryRows.map((row) => (
                    <div key={row.name} className="rounded-xl border border-ink/6 bg-white px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{row.name}</p>
                          <p className="mt-1 text-xs text-ink/45">已賣出成本 {currency(row.soldCost)} · {row.count} 檔</p>
                        </div>
                        <div className="text-right">
                          <p className={"text-sm font-bold " + profitClass(row.realized)}>{currency(row.realized)}</p>
                          <p className={"mt-1 text-xs " + profitClass(row.realized)}>報酬率 {percent(row.returnRate)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
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
            <div key={item.key} className={"rounded-xl border px-3 py-3 " + (expandedContributionKeys[item.key] ? "border-mint/20 bg-mint/5" : "border-ink/6 bg-paper")}>
              <button type="button" className="w-full text-left" onClick={() => toggleContributionRow(item.key)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate font-semibold">{item.label}</p>
                      <span className="shrink-0 text-ink/45">{expandedContributionKeys[item.key] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                    </div>
                    <p className={"mt-1 truncate text-sm font-semibold " + profitClass(item.value)}>{currency(item.value)} · 報酬率 {percent(item.returnRate)}</p>
                    <p className="mt-1 truncate text-xs text-ink/50">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-paper px-3 py-1.5 text-sm font-bold tabular-nums text-ink">{percent(item.ratio)}</span>
                </div>
              </button>
              {expandedContributionKeys[item.key] ? (
                <div className="mt-3 space-y-2 rounded-xl border border-ink/8 bg-paper/45 p-3">
                  {item.details.length ? (
                    item.details.map((detail) => (
                      <div key={detail.key} className="flex items-start justify-between gap-3 rounded-lg bg-white px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {detail.symbol} {detail.name}
                          </p>
                          <p className="mt-1 truncate text-xs text-ink/45">
                            {detail.quantityText} · 持有成本 {detail.costText}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={"text-sm font-bold " + profitClass(detail.metricValue)}>{currency(detail.metricValue)}</p>
                          <p className={"mt-1 text-xs " + profitClass(detail.metricValue)}>報酬率 {percent(detail.returnRate)}</p>
                          <p className="mt-1 text-[11px] text-ink/45">{detail.shareText}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-ink/55">尚無可顯示明細</p>
                  )}
                </div>
              ) : null}
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
      {viewMode === "full" ? (
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
      ) : null}

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
            <div className={"rounded-xl border px-3 py-3 text-sm " + (expandedHoldingKeys[position.stock_id] ? "border-mint/20 bg-mint/5" : "border-ink/6 bg-paper")} key={position.stock_id}>
              <button type="button" className="w-full text-left" onClick={() => toggleHoldingRow(position.stock_id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate font-semibold">
                        #{index + 1} {position.symbol} {position.name}
                      </p>
                      <span className="shrink-0 text-ink/45">{expandedHoldingKeys[position.stock_id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                    </div>
                    <p className="mt-1 truncate text-ink/55">{currency(getPositionBasisValue(position, analysisBasis))} · {position.industry}</p>
                  </div>
                  <p className="shrink-0 font-bold">{percent(holdingsBasisTotal > 0 ? getPositionBasisValue(position, analysisBasis) / holdingsBasisTotal : 0)}</p>
                </div>
              </button>
              {expandedHoldingKeys[position.stock_id] ? (
                <div className="mt-3 rounded-xl border border-ink/8 bg-paper/45 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <MetricTile label="持有股數" value={`${position.quantity} 股`} />
                    <MetricTile label="持有成本" value={currency(position.holding_cost)} />
                    <MetricTile label="預估損益" value={currency(position.estimated_profit)} valueClass={profitClass(position.estimated_profit)} />
                    <MetricTile label="報酬率" value={percent(position.estimated_return_rate)} valueClass={profitClass(position.estimated_profit)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink/55">
                    <span className="rounded-full bg-white px-2.5 py-1">{position.industry}</span>
                    {position.tags.length ? position.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2.5 py-1">{tag}</span>) : <span className="rounded-full bg-white px-2.5 py-1">未標籤</span>}
                  </div>
                </div>
              ) : null}
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

      {viewMode === "full" ? (
        <CollapsibleCard
          title="近期操作"
          subtitle="合併近期買賣金流與交易習慣，先看重點再看趨勢"
          collapsed={collapsedCards.trend ?? false}
          onToggle={() => toggleCard("trend")}
          summary={
            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="期間" value={trendWindowLabel} />
              <MetricTile label="操作次數" value={`${recentTradeCount} 次`} />
              <MetricTile label="淨投入" value={currency(trendSummary.net)} valueClass={profitClass(trendSummary.net)} />
              <MetricTile label="最常交易" value={tradeBehavior.mostTradedCount ? `${tradeBehavior.mostTradedCount} 次` : "0 次"} />
            </div>
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{trendWindowLabel} 操作摘要</p>
              <p className="mt-1 text-xs text-ink/50">賣出視為現金回收，買入視為資金投入。</p>
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricTile label="買入" value={currency(trendSummary.buy)} />
            <MetricTile label="賣出" value={currency(trendSummary.sell)} />
            <MetricTile label="淨投入" value={currency(trendSummary.net)} valueClass={profitClass(trendSummary.net)} />
            <MetricTile label="操作次數" value={`${recentTradeCount} 次`} />
            <MetricTile label="平均單筆買入" value={currency(tradeBehavior.avgBuyAmount)} />
            <MetricTile label="買 / 賣次數" value={`${tradeBehavior.buyCount} / ${tradeBehavior.sellCount}`} />
          </div>
          <div className="mt-3 rounded-md bg-paper px-3 py-3">
            <p className="text-xs text-ink/55">最常交易標的</p>
            <p className="mt-1 text-sm font-semibold">{tradeBehavior.mostTradedLabel}</p>
          </div>
          {trendData.length ? (
            <div className="mt-4 rounded-xl bg-paper/45 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">每日淨投入</p>
                <p className="text-xs text-ink/45">只顯示淨額，降低買賣柱混雜</p>
              </div>
              <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6f685c" }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: number) => currency(Number(value))} labelFormatter={(label) => `日期 ${label}`} />
                  <Bar dataKey="net" name="淨投入" radius={[6, 6, 0, 0]}>
                    {trendData.map((item) => (
                      <Cell key={item.label} fill={item.net >= 0 ? "#35624d" : "#d45c4a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink/55">尚無近期交易資料</p>
          )}
        </CollapsibleCard>
      ) : null}

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
  data: { name: string; value: number; ratio: number; holdingCost?: number; marketValue?: number; estimatedProfit?: number; returnRate?: number }[];
  empty: string;
  basisLabel: string;
  details: Record<string, DetailPositionRow[]>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [selectedName, setSelectedName] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    setVisibleCount(5);
  }, [data]);

  const selectedItem = data.find((item) => item.name === selectedName) ?? null;
  const selectedDetails = selectedItem ? details[selectedItem.name] ?? [] : [];

  function toggleSelection(name: string) {
    setSelectedName((current) => (current === name ? "" : name));
  }
  return (
    <CollapsibleCard
      title={title}
      subtitle={`依目前範圍計算 ${basisLabel} 占比`}
      collapsed={collapsed}
      onToggle={onToggle}
      summary={
        selectedItem ? (
          <div className="grid grid-cols-3 gap-2">
            <MetricTile label="已選分類" value={selectedItem.name} />
            <MetricTile label={basisLabel} value={currency(selectedItem.value)} />
            <MetricTile label="配置占比" value={percent(selectedItem.ratio)} />
          </div>
        ) : (
          <p className="text-sm text-ink/55">{empty}</p>
        )
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink/50">點擊分類可展開或收合持股明細</p>
        <div className="rounded-full bg-paper px-3 py-1 text-xs font-semibold tabular-nums text-ink/55">{data.length} 類</div>
      </div>
      {data.length ? (
        <>
          <div className="mt-4 space-y-2">
            {data.slice(0, visibleCount).map((item, index) => {
              const itemDetails = details[item.name] ?? [];
              const isSelected = selectedName === item.name;
              return (
                <div
                  className={
                    "rounded-xl border px-3 py-3 shadow-[0_1px_0_rgba(10,10,10,0.02)] " +
                    (isSelected ? "border-mint/20 bg-mint/5" : "border-ink/5 bg-white")
                  }
                  key={item.name}
                >
                  <button type="button" className="w-full text-left" onClick={() => toggleSelection(item.name)}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-ink">{item.name}</span>
                            <span className="shrink-0 text-ink/45">{isSelected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
                          </span>
                          <span className="mt-0.5 block text-xs tabular-nums text-ink/45">
                            {currency(item.value)} · {itemDetails.length} 檔
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-paper px-3 py-1.5 text-sm font-bold tabular-nums text-ink">{percent(item.ratio)}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.ratio * 100)}%`, backgroundColor: colors[index % colors.length] }} />
                    </div>
                  </button>
                  {isSelected ? (
                    <div className="mt-3 rounded-xl border border-ink/8 bg-paper/45 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">持股明細</p>
                        <p className="text-xs text-ink/45">共 {itemDetails.length} 檔</p>
                      </div>
                      {itemDetails.length ? (
                        <div className="mt-3 space-y-2">
                          {itemDetails.map((detail) => (
                            <div key={detail.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">
                                  {detail.symbol} {detail.name}
                                </p>
                                <p className="mt-1 truncate text-xs text-ink/45">{detail.quantityText} · {basisLabel} {currency(detail.basisValue)}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <span className="inline-flex rounded-full bg-mint/10 px-2.5 py-1 text-xs font-bold tabular-nums text-mint">
                                  {percent(detail.ratioOfGroup)}
                                </span>
                                <p className="mt-1 text-xs text-ink/45">占此類別</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-ink/55">尚無持股明細</p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {selectedItem ? (
            <div className="mt-3 rounded-xl border border-mint/15 bg-mint/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{selectedItem.name}</p>
                  <p className="mt-1 text-xs text-ink/45">目前展開分類摘要</p>
                </div>
                <span className="rounded-full bg-mint/10 px-3 py-1.5 text-sm font-bold tabular-nums text-mint">{percent(selectedItem.ratio)}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricTile label={basisLabel} value={currency(selectedItem.value)} />
                <MetricTile label="配置占比" value={percent(selectedItem.ratio)} />
                <MetricTile label="持股檔數" value={`${selectedDetails.length} 檔`} />
              </div>
            </div>
          ) : null}
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

function RatioListCard({
  title,
  data,
  empty,
  basisLabel,
  details,
  collapsed,
  onToggle
}: {
  title: string;
  data: { name: string; value: number; ratio: number; holdingCost?: number; marketValue?: number; estimatedProfit?: number; returnRate?: number }[];
  empty: string;
  basisLabel: string;
  details: Record<string, DetailPositionRow[]>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    setVisibleCount(5);
  }, [data]);

  const topItem = data[0] ?? null;

  return (
    <CollapsibleCard
      title={title}
      subtitle={`依目前範圍計算 ${basisLabel} 占比`}
      collapsed={collapsed}
      onToggle={onToggle}
      summary={
        topItem ? (
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="最大分類" value={topItem.name} />
            <MetricTile label="占比" value={percent(topItem.ratio)} />
          </div>
        ) : (
          <p className="text-sm text-ink/55">{empty}</p>
        )
      }
    >
      {data.length ? (
        <>
          <div className="space-y-2">
            {data.slice(0, visibleCount).map((item, index) => {
              const detailCount = details[item.name]?.length ?? 0;
              return (
                <div key={item.name} className="rounded-xl border border-ink/6 bg-white px-3 py-3 shadow-[0_1px_0_rgba(10,10,10,0.02)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink/45">
                          {currency(item.value)} · {detailCount} 檔
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-sm font-bold tabular-nums text-ink">{percent(item.ratio)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.ratio * 100)}%`, backgroundColor: colors[index % colors.length] }} />
                  </div>
                </div>
              );
            })}
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
        <p className="text-sm text-ink/55">{empty}</p>
      )}
    </CollapsibleCard>
  );
}

function AllocationBarCard({
  title,
  data,
  empty,
  basisLabel,
  details,
  collapsed,
  onToggle
}: {
  title: string;
  data: { name: string; value: number; ratio: number; holdingCost?: number; marketValue?: number; estimatedProfit?: number; returnRate?: number }[];
  empty: string;
  basisLabel: string;
  details: Record<string, DetailPositionRow[]>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const etfItem = data.find((item) => item.name === "ETF") ?? null;
  const equityItem = data.find((item) => item.name === "個股") ?? null;

  return (
    <CollapsibleCard
      title={title}
      subtitle={`依目前範圍計算 ${basisLabel} 占比`}
      collapsed={collapsed}
      onToggle={onToggle}
      summary={
        data.length ? (
          <div className="grid grid-cols-2 gap-2">
            <MetricTile label="ETF" value={percent(etfItem?.ratio ?? 0)} />
            <MetricTile label="個股" value={percent(equityItem?.ratio ?? 0)} />
          </div>
        ) : (
          <p className="text-sm text-ink/55">{empty}</p>
        )
      }
    >
      {data.length ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-full bg-paper">
            <div className="flex h-4 w-full">
              {data.map((item, index) => (
                <div
                  key={item.name}
                  className="h-full"
                  style={{ width: `${Math.max(0, item.ratio * 100)}%`, backgroundColor: colors[index % colors.length] }}
                  title={`${item.name} ${percent(item.ratio)}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.map((item, index) => {
              const detailCount = details[item.name]?.length ?? 0;
              return (
                <div key={item.name} className="rounded-xl border border-ink/6 bg-paper/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                        <p className="mt-1 text-xs text-ink/45">{detailCount} 檔</p>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{percent(item.ratio)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MetricTile label={basisLabel} value={currency(item.value)} />
                    <MetricTile label="配置占比" value={percent(item.ratio)} />
                    <MetricTile label="預估損益" value={currency(item.estimatedProfit ?? 0)} valueClass={profitClass(item.estimatedProfit ?? 0)} />
                    <MetricTile label="報酬率" value={percent(item.returnRate ?? 0)} valueClass={profitClass(item.estimatedProfit ?? 0)} />
                  </div>
                  <p className="mt-2 text-xs text-ink/45">
                    成本 {currency(item.holdingCost ?? 0)} · 市值 {currency(item.marketValue ?? 0)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink/55">{empty}</p>
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

function isEtfPosition(position: Position) {
  return isEtfMeta(position.symbol, position.name, position.industry);
}

function isEtfMeta(symbolValue: string, nameValue: string, industryValue: string) {
  const symbol = symbolValue.trim();
  const industry = industryValue.toUpperCase();
  const name = nameValue.toUpperCase();
  if (industry.includes("ETF") || name.includes("ETF")) return true;
  return /^00\d{2,3}$/.test(symbol);
}

function getRealizedStartKey(window: RealizedWindow, anchorDate: Date) {
  if (window === "all") return "";
  const months = window === "1m" ? 1 : window === "3m" ? 3 : window === "6m" ? 6 : 12;
  const start = new Date(anchorDate);
  start.setMonth(start.getMonth() - months);
  start.setDate(start.getDate() + 1);
  return start.toISOString().slice(0, 10);
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
  ratioOfGroup: number;
  ratioOfPortfolio: number;
};

type ContributionDetailRow = {
  key: string;
  symbol: string;
  name: string;
  metricValue: number;
  returnRate: number;
  quantityText: string;
  costText: string;
  shareText: string;
};

function sumContributionSoldCost(details: ContributionDetailRow[]) {
  return roundMoney(
    details.reduce((sum, detail) => {
      const normalized = Number(detail.costText.replace(/[$,]/g, ""));
      return sum + (Number.isFinite(normalized) ? normalized : 0);
    }, 0)
  );
}

function buildDetailLookup(
  groups: { name: string }[],
  positions: Position[],
  basis: AnalysisBasis,
  matcher: (name: string, position: Position) => boolean
) {
  const lookup: Record<string, DetailPositionRow[]> = {};
  const portfolioBasisTotal = positions.reduce((sum, position) => sum + getPositionBasisValue(position, basis), 0);
  for (const group of groups) {
    const matchedPositions = positions
      .filter((position) => matcher(group.name, position))
      .sort((a, b) => getPositionBasisValue(b, basis) - getPositionBasisValue(a, basis));
    const groupBasisTotal = matchedPositions.reduce((sum, position) => sum + getPositionBasisValue(position, basis), 0);
    lookup[group.name] = matchedPositions.map((position) => ({
      key: position.stock_id,
      symbol: position.symbol,
      name: position.name,
      quantityText: `${position.quantity} 股`,
      basisValue: getPositionBasisValue(position, basis),
      marketValue: position.market_value,
      unrealizedProfit: position.estimated_profit,
      ratioOfGroup: groupBasisTotal > 0 ? getPositionBasisValue(position, basis) / groupBasisTotal : 0,
      ratioOfPortfolio: portfolioBasisTotal > 0 ? getPositionBasisValue(position, basis) / portfolioBasisTotal : 0
    }));
  }
  return lookup;
}
