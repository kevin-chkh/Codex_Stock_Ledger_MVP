export type StockCatalogItem = {
  symbol: string;
  name: string;
  industry: string;
  market?: string;
  isEtf?: boolean;
};

export type StockCatalogLoadResult = {
  catalog: StockCatalogItem[];
  source: "api" | "cache" | "fallback";
};

const FALLBACK_STOCKS: StockCatalogItem[] = [
  { symbol: "0050", name: "\u5143\u5927\u53f0\u706350", industry: "ETF", market: "TWSE", isEtf: true },
  { symbol: "0056", name: "\u5143\u5927\u9ad8\u80a1\u606f", industry: "ETF", market: "TWSE", isEtf: true },
  { symbol: "00878", name: "\u570b\u6cf0\u6c38\u7e8c\u9ad8\u80a1\u606f", industry: "ETF", market: "TWSE", isEtf: true },
  { symbol: "00919", name: "\u7fa4\u76ca\u53f0\u7063\u7cbe\u9078\u9ad8\u606f", industry: "ETF", market: "TWSE", isEtf: true },
  { symbol: "2330", name: "\u53f0\u7a4d\u96fb", industry: "\u534a\u5c0e\u9ad4\u696d", market: "TWSE", isEtf: false },
  { symbol: "2317", name: "\u9d3b\u6d77", industry: "\u5176\u4ed6\u96fb\u5b50\u696d", market: "TWSE", isEtf: false },
  { symbol: "2454", name: "\u806f\u767c\u79d1", industry: "\u534a\u5c0e\u9ad4\u696d", market: "TWSE", isEtf: false },
  { symbol: "3711", name: "\u65e5\u6708\u5149\u6295\u63a7", industry: "\u534a\u5c0e\u9ad4\u696d", market: "TWSE", isEtf: false },
  { symbol: "3771", name: "\u6607\u967d\u534a\u5c0e\u9ad4", industry: "\u534a\u5c0e\u9ad4\u696d", market: "Emerging", isEtf: false },
  { symbol: "2308", name: "\u53f0\u9054\u96fb", industry: "\u96fb\u5b50\u96f6\u7d44\u4ef6\u696d", market: "TWSE", isEtf: false },
  { symbol: "2884", name: "\u7389\u5c71\u91d1", industry: "\u91d1\u878d\u4fdd\u96aa\u696d", market: "TWSE", isEtf: false },
  { symbol: "2886", name: "\u5146\u8c50\u91d1", industry: "\u91d1\u878d\u4fdd\u96aa\u696d", market: "TWSE", isEtf: false }
];

const CACHE_KEY = "stock-ledger-catalog-v2";

export async function loadStockCatalog(): Promise<StockCatalogLoadResult> {
  const cached = loadCatalogCache();
  try {
    const response = await fetch("/api/stock-catalog", { method: "GET" });
    if (!response.ok) throw new Error("stock catalog API failed");
    const remote = (await response.json()) as StockCatalogItem[];
    const merged = mergeCatalog([...FALLBACK_STOCKS, ...remote]);
    if (merged.length) {
      saveCatalogCache(merged);
      return { catalog: merged, source: "api" };
    }
  } catch {
    // Keep the last successful catalog when the remote source is unavailable.
  }

  if (cached.length) return { catalog: cached, source: "cache" };
  return { catalog: FALLBACK_STOCKS, source: "fallback" };
}

export function findStockBySymbol(catalog: StockCatalogItem[], symbol: string) {
  const normalized = symbol.trim();
  if (!normalized) return undefined;
  const exact = catalog.find((item) => item.symbol === normalized);
  if (exact) return exact;
  if (/^00\d+/.test(normalized)) return { symbol: normalized, name: "", industry: "ETF", market: "TWSE", isEtf: true };
  return undefined;
}

export function findStockByName(catalog: StockCatalogItem[], name: string) {
  const normalized = name.trim();
  if (!normalized) return undefined;
  return catalog.find((item) => item.name === normalized || item.name.includes(normalized));
}

export function fuzzySearchBySymbol(catalog: StockCatalogItem[], keyword: string, limit = 8) {
  const q = keyword.trim();
  if (!q) return [];
  const starts = catalog.filter((item) => item.symbol.startsWith(q));
  const contains = catalog.filter((item) => !item.symbol.startsWith(q) && item.symbol.includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export function fuzzySearchStocks(catalog: StockCatalogItem[], keyword: string, limit = 8) {
  const q = keyword.trim().toLowerCase();
  if (!q) return [];

  const score = (item: StockCatalogItem) => {
    const symbol = item.symbol.toLowerCase();
    const name = item.name.toLowerCase();
    if (symbol === q || name === q) return 0;
    if (symbol.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (symbol.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return 99;
  };

  return catalog
    .map((item) => ({ item, score: score(item) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, limit)
    .map((entry) => entry.item);
}

function loadCatalogCache(): StockCatalogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StockCatalogItem[];
    return Array.isArray(parsed) ? mergeCatalog(parsed) : [];
  } catch {
    return [];
  }
}

function saveCatalogCache(catalog: StockCatalogItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Ignore cache write failures.
  }
}

function mergeCatalog(items: StockCatalogItem[]) {
  const map = new Map<string, StockCatalogItem>();
  for (const item of items) {
    const isEtf = item.isEtf ?? (item.industry === "ETF" || /^00\d+/.test(item.symbol));
    map.set(item.symbol, {
      ...item,
      industry: isEtf ? "ETF" : item.industry || "\u672a\u5206\u985e",
      market: item.market || "TWSE",
      isEtf
    });
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
