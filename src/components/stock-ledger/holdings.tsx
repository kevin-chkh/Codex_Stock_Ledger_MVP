import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { currency, decimal, percent, profitClass } from "@/lib/format";
import type { Position } from "@/lib/types";
import { ListSection } from "./ui";

export function Holdings({ positions, onEdit }: { positions: Position[]; onEdit: (position: Position) => void }) {
  const openPositions = useMemo(() => positions.filter((position) => position.quantity > 0), [positions]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"marketValue" | "returnRate" | "profit" | "symbol">("marketValue");
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
      <ListSection title={"持股 " + filteredPositions.length + " 檔"} empty={openPositions.length ? "沒有符合條件的持股" : "尚無持股"}>
        {filteredPositions.map((position) => (
          <article key={position.stock_id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{position.symbol + " " + position.name}</h3>
                <p className="mt-1 text-xs text-ink/50">
                  {position.quantity + " 股" + (position.industry ? " · " + position.industry : "")}
                </p>
              </div>
              <button className="rounded-md border border-ink/10 px-3 py-2 text-sm" onClick={() => onEdit(position)}>
                調整
              </button>
            </div>
            <div className="mt-4 rounded-md bg-paper p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink/55">持有成本(含手續費)</p>
                  <p className="mt-1 font-bold">{currency(position.holding_cost)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink/55">市值</p>
                  <p className="mt-1 font-bold">{currency(position.market_value)}</p>
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs text-ink/55">每股均價</p>
                <p className="mt-1 font-bold">{decimal(position.average_cost, 1)}</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xs text-ink/55">報酬率</p>
                <p className={"mt-1 font-bold " + profitClass(position.unrealized_profit)}>{percent(position.unrealized_return_rate)}</p>
              </div>
              <div className="col-span-2 rounded-md bg-paper p-3">
                <p className="text-xs text-ink/55">預估損益</p>
                <p className={"mt-1 font-bold " + profitClass(position.unrealized_profit)}>{currency(position.unrealized_profit)}</p>
              </div>
            </div>
            {position.realized_profit !== 0 ? (
              <p className={"mt-3 text-xs " + profitClass(position.realized_profit)}>{"已實現損益 " + currency(position.realized_profit)}</p>
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
        ))}
      </ListSection>
    </div>
  );
}
