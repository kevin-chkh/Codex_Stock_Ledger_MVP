import { ChevronDown, ChevronUp, Download, LayoutGrid, List, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { currency, decimal, percent, profitClass } from "@/lib/format";
import type { Portfolio, Position } from "@/lib/types";
import { ListSection, PortfolioScopePicker } from "./ui";

export function Holdings({
  positions,
  portfolios,
  selectedPortfolioId,
  onPortfolioChange,
  onAdjustCost,
  onImportCsv
}: {
  positions: Position[];
  portfolios: Portfolio[];
  selectedPortfolioId: string;
  onPortfolioChange: (portfolioId: string) => void;
  onAdjustCost: (position: Position) => void;
  onImportCsv: (file: File) => void;
}) {
  const openPositions = useMemo(() => positions.filter((position) => position.quantity > 0), [positions]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"marketValue" | "returnRate" | "profit" | "symbol">("marketValue");
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "expanded">("list");

  const feeSummary = useMemo(
    () => ({
      fee: openPositions.reduce((sum, position) => sum + position.paid_fee, 0),
      tax: openPositions.reduce((sum, position) => sum + position.paid_tax, 0)
    }),
    [openPositions]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    openPositions.forEach((position) => position.tags.forEach((tag) => tags.add(tag)));
    return [...tags].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [openPositions]);

  const availableIndustries = useMemo(
    () => [...new Set(openPositions.map((position) => position.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [openPositions]
  );

  const filteredPositions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...openPositions]
      .filter((position) => {
        const searchable = [position.symbol, position.name, position.industry, ...position.tags].join(" ").toLowerCase();
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (tagFilter !== "all" && !position.tags.includes(tagFilter)) return false;
        if (industryFilter !== "all" && position.industry !== industryFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "returnRate") return b.unrealized_return_rate - a.unrealized_return_rate;
        if (sortBy === "profit") return b.unrealized_profit - a.unrealized_profit;
        if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol);
        return b.market_value - a.market_value;
      });
  }, [industryFilter, openPositions, query, sortBy, tagFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <PortfolioScopePicker
            label="目前："
            value={selectedPortfolioId}
            onChange={onPortfolioChange}
            options={portfolios.map((portfolio) => [portfolio.id, portfolio.name])}
          />
        </div>
        <label className="flex items-center gap-2 rounded-md border border-ink/15 px-3 py-2">
          <Search size={18} className="shrink-0 text-ink/45" />
          <input
            className="w-full border-0 p-0 outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋代號、名稱、產業、標籤"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部標籤</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <select className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint" value={industryFilter} onChange={(event) => setIndustryFilter(event.target.value)}>
            <option value="all">全部產業</option>
            {availableIndustries.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
          <select className="col-span-2 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint" value={sortBy} onChange={(event) => setSortBy(event.target.value as "marketValue" | "returnRate" | "profit" | "symbol")}>
            <option value="marketValue">市值高到低</option>
            <option value="returnRate">報酬率高到低</option>
            <option value="profit">未實現損益高到低</option>
            <option value="symbol">代號小到大</option>
          </select>
          <button
            className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white"
            onClick={() => exportHoldingsCsv(filteredPositions, portfolios)}
          >
            <Download size={17} />
            匯出持股
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-sm font-semibold">
            <Upload size={17} />
            匯入持股
            <input
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportCsv(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="mt-3 rounded-md bg-paper px-3 py-3 text-xs leading-6 text-ink/60">
          <p className="font-semibold text-ink/75">持股匯入格式</p>
          <p>必填：帳本、股票代號、股票名稱、持有股數、持有成本</p>
          <p>可選：目前價格、產業別、標籤。匯入會更新目前庫存校正資料，不會新增交易紀錄。</p>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white px-4 py-3 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">累計費用</p>
            <p className="mt-1 text-xs text-ink/50">持股相關已發生成本</p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-ink/55">手續費 </span>
              <strong>{currency(feeSummary.fee)}</strong>
            </p>
            <p className="mt-1">
              <span className="text-ink/55">交易稅 </span>
              <strong>{currency(feeSummary.tax)}</strong>
            </p>
          </div>
        </div>
      </section>

      <ListSection
        title={`持股 ${filteredPositions.length} 檔`}
        empty={openPositions.length ? "沒有符合條件的持股" : "尚無持股"}
        action={
          <div className="inline-flex rounded-lg border border-ink/10 bg-paper p-1">
            <button
              className={"rounded-md p-2 " + (viewMode === "list" ? "bg-white text-mint shadow-sm" : "text-ink/55")}
              onClick={() => setViewMode("list")}
              aria-label="切換為清單模式"
              title="清單模式"
            >
              <List size={16} />
            </button>
            <button
              className={"rounded-md p-2 " + (viewMode === "expanded" ? "bg-white text-mint shadow-sm" : "text-ink/55")}
              onClick={() => setViewMode("expanded")}
              aria-label="切換為完整展開模式"
              title="完整展開模式"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        }
      >
        {viewMode === "list" ? (
          <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
            {filteredPositions.map((position, index) => {
              const expanded = expandedPositionId === position.stock_id;
              return (
                <article key={position.stock_id} className={index ? "border-t border-ink/8" : ""}>
                  <div className="px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setExpandedPositionId(expanded ? null : position.stock_id)}>
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold">
                            {position.symbol} {position.name}
                          </p>
                          {expanded ? <ChevronUp size={16} className="shrink-0 text-ink/45" /> : <ChevronDown size={16} className="shrink-0 text-ink/45" />}
                        </div>
                        <p className="mt-1 truncate text-xs text-ink/50">
                          {position.quantity} 股{position.industry ? ` · ${position.industry}` : ""}
                        </p>
                      </button>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{currency(position.market_value)}</p>
                        <p className={"mt-1 text-xs " + profitClass(position.unrealized_profit)}>{percent(position.unrealized_return_rate)}</p>
                        <p className={"mt-0.5 text-xs font-semibold " + profitClass(position.unrealized_profit)}>{currency(position.unrealized_profit)}</p>
                      </div>
                    </div>

                    {expanded ? <ExpandedHoldingCard position={position} onAdjustCost={onAdjustCost} /> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPositions.map((position) => (
              <ExpandedHoldingCard key={position.stock_id} position={position} onAdjustCost={onAdjustCost} />
            ))}
          </div>
        )}
      </ListSection>
    </div>
  );
}

function exportHoldingsCsv(positions: Position[], portfolios: Portfolio[]) {
  const portfolioMap = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]));
  const headers = ["帳本", "股票代號", "股票名稱", "持有股數", "持有成本", "目前價格", "產業別", "標籤"];
  const rows = positions.map((position) => [
    portfolioMap.get(position.portfolio_id) ?? "",
    position.symbol,
    position.name,
    position.quantity,
    position.holding_cost,
    position.current_price,
    position.industry === "未分類" ? "" : position.industry,
    position.tags.join(", ")
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  triggerCsvDownload(csv, "stock-ledger-holdings.csv");
}

function triggerCsvDownload(csv: string, filename: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function ExpandedHoldingCard({
  position,
  onAdjustCost
}: {
  position: Position;
  onAdjustCost: (position: Position) => void;
}) {
  return (
    <article className="rounded-xl border border-ink/10 bg-[#fcfbf7] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {position.symbol} {position.name}
          </p>
          <p className="mt-1 truncate text-xs text-ink/50">
            {position.quantity} 股{position.industry ? ` · ${position.industry}` : ""}
          </p>
        </div>
        <button
          className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/75"
          onClick={() => onAdjustCost(position)}
          aria-label={`調整 ${position.symbol} ${position.name} 成本`}
        >
          調整
        </button>
      </div>

      <div className="mt-3 rounded-lg bg-white px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-ink/45">持有成本(含手續費)</p>
            <p className="mt-2 text-2xl font-bold">{currency(position.holding_cost)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-ink/45">市值</p>
            <p className="mt-2 text-2xl font-bold">{currency(position.market_value)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white px-4 py-4">
          <p className="text-[11px] text-ink/45">每股均價</p>
          <p className="mt-2 text-lg font-semibold">{decimal(position.average_cost, 1)}</p>
        </div>
        <div className="rounded-lg bg-white px-4 py-4">
          <p className="text-[11px] text-ink/45">報酬率</p>
          <p className={"mt-2 text-lg font-semibold " + profitClass(position.unrealized_profit)}>{percent(position.unrealized_return_rate)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white px-4 py-4">
        <p className="text-[11px] text-ink/45">預估損益</p>
        <p className={"mt-2 text-2xl font-bold " + profitClass(position.unrealized_profit)}>{currency(position.unrealized_profit)}</p>
      </div>

      {position.realized_profit !== 0 ? (
        <p className={"mt-3 text-sm " + profitClass(position.realized_profit)}>
          已實現損益 {currency(position.realized_profit)}
        </p>
      ) : null}

      {position.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {position.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gold/15 px-2 py-1 text-ink/70">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
