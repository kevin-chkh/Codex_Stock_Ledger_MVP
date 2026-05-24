import { Download, Pencil, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { currency } from "@/lib/format";
import type { Portfolio, Stock, Trade, TradeType } from "@/lib/types";
import { ListSection } from "./ui";

export function Trades({
  trades,
  stocks,
  portfolios,
  onEdit,
  onDelete,
  onImportCsv
}: {
  trades: Trade[];
  stocks: Stock[];
  portfolios: Portfolio[];
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onImportCsv: (file: File) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TradeType | "all">("all");
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"dateDesc" | "dateAsc" | "amountDesc">("dateDesc");
  const stockMap = useMemo(() => new Map(stocks.map((stock) => [stock.id, stock])), [stocks]);
  const portfolioMap = useMemo(() => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])), [portfolios]);
  const filteredTrades = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...trades]
      .filter((trade) => {
        const stock = stockMap.get(trade.stock_id);
        const portfolioName = portfolioMap.get(trade.portfolio_id) ?? "";
        const searchable = [stock?.symbol, stock?.name, portfolioName, trade.type === "buy" ? "買入" : "賣出"]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (typeFilter !== "all" && trade.type !== typeFilter) return false;
        if (portfolioFilter !== "all" && trade.portfolio_id !== portfolioFilter) return false;
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "dateAsc") return new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime();
        if (sortBy === "amountDesc") return b.net_amount - a.net_amount;
        return new Date(b.traded_at).getTime() - new Date(a.traded_at).getTime();
      });
  }, [portfolioFilter, portfolioMap, query, sortBy, stockMap, trades, typeFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <label className="flex items-center gap-2 rounded-md border border-ink/15 px-3 py-2">
          <Search size={18} className="shrink-0 text-ink/45" />
          <input
            className="w-full border-0 p-0 outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋代號、名稱、帳本"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TradeType | "all")}
          >
            <option value="all">全部買賣</option>
            <option value="buy">只看買入</option>
            <option value="sell">只看賣出</option>
          </select>
          <select
            className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint"
            value={portfolioFilter}
            onChange={(event) => setPortfolioFilter(event.target.value)}
          >
            <option value="all">全部帳本</option>
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-mint"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "dateDesc" | "dateAsc" | "amountDesc")}
          >
            <option value="dateDesc">新到舊</option>
            <option value="dateAsc">舊到新</option>
            <option value="amountDesc">金額高到低</option>
          </select>
          <button
            className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white"
            onClick={() => exportTradesCsv(filteredTrades, stockMap, portfolioMap)}
          >
            <Download size={17} />
            匯出 CSV
          </button>
          <label className="col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-2 text-sm font-semibold">
            <Upload size={17} />
            匯入 CSV
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
      </section>
      <ListSection title={"交易紀錄 " + filteredTrades.length + " 筆"} empty={trades.length ? "沒有符合條件的交易" : "尚無交易"}>
        {filteredTrades.map((trade) => {
          const stock = stockMap.get(trade.stock_id);
          return (
            <TradeRow
              key={trade.id}
              trade={trade}
              title={(trade.type === "buy" ? "買入" : "賣出") + " " + (stock?.symbol ?? "") + " " + (stock?.name ?? "")}
              subtitle={(portfolioMap.get(trade.portfolio_id) ?? "") + " · " + trade.quantity + " 股 x " + currency(trade.unit_price) + " · 手續費 " + currency(trade.fee)}
              right={currency(trade.net_amount)}
              rightClass={trade.type === "buy" ? "text-coral" : "text-mint"}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
        })}
      </ListSection>
    </div>
  );
}

function exportTradesCsv(trades: Trade[], stockMap: Map<string, Stock>, portfolioMap: Map<string, string>) {
  const headers = ["日期", "帳本", "買賣", "股票代號", "股票名稱", "股數", "成交單價", "成交金額", "手續費", "交易稅", "淨額"];
  const rows = trades.map((trade) => {
    const stock = stockMap.get(trade.stock_id);
    return [
      trade.traded_at,
      portfolioMap.get(trade.portfolio_id) ?? "",
      trade.type === "buy" ? "買入" : "賣出",
      stock?.symbol ?? "",
      stock?.name ?? "",
      trade.quantity,
      trade.unit_price,
      trade.gross_amount,
      trade.fee,
      trade.tax,
      trade.net_amount
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stock-ledger-trades.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function TradeRow({
  trade,
  title,
  subtitle,
  right,
  rightClass,
  onEdit,
  onDelete
}: {
  trade: Trade;
  title: string;
  subtitle: string;
  right: string;
  rightClass: string;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
}) {
  return (
    <div className="border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          <p className="mt-1 truncate text-sm text-ink/55">{subtitle}</p>
        </div>
        <p className={"shrink-0 text-sm font-bold " + rightClass}>{right}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="flex items-center gap-1 rounded-md border border-ink/10 px-3 py-2 text-sm" onClick={() => onEdit(trade)}>
          <Pencil size={15} />
          編輯
        </button>
        <button className="flex items-center gap-1 rounded-md border border-coral/20 px-3 py-2 text-sm text-coral" onClick={() => onDelete(trade)}>
          <Trash2 size={15} />
          刪除
        </button>
      </div>
    </div>
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
