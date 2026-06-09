"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  ChartPie,
  Home,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  TrendingDown,
  TrendingUp,
  X
} from "lucide-react";
import { z } from "zod";
import { calculateDashboardMetrics, calculateTradeAmounts, DEFAULT_SETTINGS, buildPositions, resolveUnitPriceFromTotalAmount } from "@/lib/calculations";
import { parseCsv } from "@/lib/csv";
import { currency, parseTags, profitClass } from "@/lib/format";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { findStockBySymbol, loadStockCatalog, type StockCatalogItem } from "@/lib/stock-lookup";
import { buildPortfolioUpdates, deleteTradeFromPortfolios, hasOversoldPosition, makeTrade, tradeCashImpact } from "@/lib/trade-ledger";
import type { CashMovement, CashMovementType, Portfolio, PortfolioStockOverride, Position, PositionAdjustment, Stock, StockTag, Trade, TradeType, UserSettings } from "@/lib/types";
import { Dashboard } from "@/components/stock-ledger/dashboard";
import { ConfirmSheet, ListSection, Row } from "@/components/stock-ledger/ui";
import { Trades } from "@/components/stock-ledger/trades";
import { Holdings } from "@/components/stock-ledger/holdings";
import { Analytics } from "@/components/stock-ledger/analytics";
import { CashForm, PortfolioForm, SettingsForm, StockAdjustForm, TradeForm } from "@/components/stock-ledger/forms";
import { Portfolios } from "@/components/stock-ledger/portfolios";

type Tab = "dashboard" | "portfolios" | "trades" | "holdings" | "analytics";
type SheetMode = "actions" | "trade" | "cash" | "portfolio" | "stockAdjust" | "settings" | null;
type TradeDraft = {
  portfolioId: string;
  type: TradeType;
  buyMode: "unitPrice" | "totalAmount";
  tradedAt: string;
  symbol: string;
  name: string;
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  totalAmountIncludesFees: boolean;
  industry: string;
  tags: string;
};
type PortfolioDraft = { name: string; initialAmount: string; note: string };
type CashDraft = { portfolioId: string; type: CashMovementType; amount: string; note: string };
type StockDraft = { stockId: string; portfolioId: string; currentPrice: string; quantity: string; holdingCost: string; industry: string; tags: string };
type LocalSnapshot = {
  version: 1;
  portfolios: Portfolio[];
  cashMovements: CashMovement[];
  stocks: Stock[];
  stockTags: StockTag[];
  portfolioStockOverrides: PortfolioStockOverride[];
  trades: Trade[];
  positionAdjustments: PositionAdjustment[];
  settings: UserSettings;
};

type QuotePayload = {
  quotes: { symbol: string; market: string; price: number; priceUpdatedAt: string }[];
  failedSymbols: string[];
};

type CsvImportSummary = {
  totalRows: number;
  importedCount: number;
  skipped: { line: number; reason: string; raw: string[] }[];
};
type ConfirmState =
  | { kind: "deleteTrade"; trade: Trade }
  | { kind: "deletePortfolio"; portfolio: Portfolio }
  | { kind: "importCsv"; file: File; totalRows: number }
  | { kind: "importHoldingsCsv"; file: File; totalRows: number }
  | { kind: "importJson"; snapshot: LocalSnapshot }
  | { kind: "renamePortfolio" }
  | { kind: "cashMovement" }
  | { kind: "updateTrade" }
  | { kind: "adjustCost"; parsed: z.infer<typeof stockSchema> }
  | null;

const LOCAL_STORAGE_KEY = "stock-ledger-local-v1";
const PORTFOLIO_SCOPE_STORAGE_KEY = "stock-ledger-selected-portfolio-scope-v1";
const DEMO_BANNER_DISMISSED_KEY = "stock-ledger-demo-banner-dismissed-v1";

const tradeSchema = z.object({
  portfolioId: z.string().min(1, "請選擇帳本"),
  type: z.enum(["buy", "sell"]),
  buyMode: z.enum(["unitPrice", "totalAmount"]).default("unitPrice"),
  totalAmountIncludesFees: z.boolean().default(false),
  tradedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇成交日期")
    .refine((value) => value <= today(), "成交日期不可晚於今天"),
  symbol: z.string().min(1, "請輸入股票代號").max(20),
  name: z.string().min(1, "請輸入股票名稱").max(80),
  quantity: z.coerce.number().positive("股數需大於 0"),
  unitPrice: z.coerce.number().positive("成交單價(股)需大於 0"),
  totalAmount: z.string().optional(),
  industry: z.string().optional(),
  tags: z.string().optional()
});

const portfolioSchema = z.object({
  name: z.string().min(1, "請輸入帳本名稱"),
  initialAmount: z.coerce.number().min(0, "金額不可小於 0"),
  note: z.string().optional()
});

const cashSchema = z.object({
  portfolioId: z.string().min(1, "請選擇帳本"),
  type: z.enum(["deposit", "withdraw", "adjust"]),
  amount: z.coerce.number().positive("金額需大於 0"),
  note: z.string().optional()
});

const stockSchema = z.object({
  stockId: z.string().min(1),
  portfolioId: z.string().min(1),
  currentPrice: z.coerce.number().min(0, "價格不可小於 0"),
  quantity: z.coerce.number().min(0, "持有庫存不可小於 0"),
  holdingCost: z.coerce.number().min(0, "持有成本不可小於 0"),
  industry: z.string().optional(),
  tags: z.string().optional()
});

function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function parseNumericInput(value: string) {
  return Number(String(value || "").replace(/,/g, ""));
}

function formatQuoteUpdatedAt(value: string | null) {
  if (!value) return "未更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未更新";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function toUserError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    const message = String((error as { message: string }).message);
    if (message.toLowerCase().includes("network")) return "網路連線失敗，請稍後重試。";
    if (message.toLowerCase().includes("permission")) return "權限不足，請重新登入後再試。";
    return message;
  }
  return fallback;
}

function taipeiNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short"
  }).formatToParts(new Date());

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: pick("weekday"),
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
    second: Number(pick("second"))
  };
}

function isTaiwanMarketHours() {
  const now = taipeiNow();
  if (now.weekday === "Sat" || now.weekday === "Sun") return false;
  const totalMinutes = now.hour * 60 + now.minute;
  return totalMinutes >= 8 * 60 + 30 && totalMinutes < 14 * 60;
}

const emptyTradeDraft: TradeDraft = {
  portfolioId: "",
  type: "buy",
  buyMode: "unitPrice",
  tradedAt: today(),
  symbol: "",
  name: "",
  quantity: "",
  unitPrice: "",
  totalAmount: "",
  totalAmountIncludesFees: false,
  industry: "",
  tags: ""
};

export default function StockLedgerApp() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stockTags, setStockTags] = useState<StockTag[]>([]);
  const [portfolioStockOverrides, setPortfolioStockOverrides] = useState<PortfolioStockOverride[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positionAdjustments, setPositionAdjustments] = useState<PositionAdjustment[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [stockCatalog, setStockCatalog] = useState<StockCatalogItem[]>([]);
  const [catalogSource, setCatalogSource] = useState<"api" | "cache" | "fallback">("fallback");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [tradeDraft, setTradeDraft] = useState<TradeDraft>(emptyTradeDraft);
  const [portfolioDraft, setPortfolioDraft] = useState({ name: "", initialAmount: "", note: "" });
  const [cashDraft, setCashDraft] = useState({ portfolioId: "", type: "deposit" as CashMovementType, amount: "", note: "" });
  const [stockDraft, setStockDraft] = useState({ stockId: "", portfolioId: "", currentPrice: "", quantity: "", holdingCost: "", industry: "", tags: "" });
  const [stockAdjustBaseline, setStockAdjustBaseline] = useState({ quantity: 0, holdingCost: 0 });
  const [csvImportSummary, setCsvImportSummary] = useState<CsvImportSummary | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const catalogBySymbol = useMemo(() => new Map(stockCatalog.map((item) => [item.symbol, item])), [stockCatalog]);
  const effectiveStocks = useMemo(
    () =>
      stocks.map((stock) => {
        const catalogItem = catalogBySymbol.get(stock.symbol);
        return {
          ...stock,
          industry: resolveIndustryValue(stock.industry, catalogItem?.industry)
        };
      }),
    [stocks, catalogBySymbol]
  );
  const positions = useMemo(
    () => buildPositions(trades, effectiveStocks, stockTags, positionAdjustments, portfolioStockOverrides),
    [trades, effectiveStocks, stockTags, positionAdjustments, portfolioStockOverrides]
  );
  const stockSignature = useMemo(() => stocks.map((stock) => stock.id).sort().join("|"), [stocks]);
  const latestQuoteAt = useMemo(() => {
    const timestamps = effectiveStocks.map((stock) => stock.price_updated_at).filter((value): value is string => Boolean(value));
    if (!timestamps.length) return null;
    return timestamps.reduce((latest, current) => (new Date(current).getTime() > new Date(latest).getTime() ? current : latest));
  }, [effectiveStocks]);
  const activePortfolioId = useMemo(() => {
    if (selectedPortfolioId && portfolios.some((portfolio) => portfolio.id === selectedPortfolioId)) return selectedPortfolioId;
    return portfolios[0]?.id || "";
  }, [portfolios, selectedPortfolioId]);
  const scopedPortfolios = useMemo(() => portfolios.filter((portfolio) => portfolio.id === activePortfolioId), [activePortfolioId, portfolios]);
  const scopedPositions = useMemo(() => positions.filter((position) => position.portfolio_id === activePortfolioId), [activePortfolioId, positions]);
  const scopedTrades = useMemo(() => trades.filter((trade) => trade.portfolio_id === activePortfolioId), [activePortfolioId, trades]);
  const defaultTradePortfolioId = useMemo(() => activePortfolioId || portfolios[0]?.id || "", [activePortfolioId, portfolios]);
  const metrics = useMemo(() => calculateDashboardMetrics(scopedPortfolios, scopedPositions), [scopedPortfolios, scopedPositions]);
  const catalogSourceLabel = catalogSource === "api" ? "API" : catalogSource === "cache" ? "本地快取" : "fallback";

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedScope = window.localStorage.getItem(PORTFOLIO_SCOPE_STORAGE_KEY);
    if (storedScope) setSelectedPortfolioId(storedScope);
    setDemoBannerDismissed(window.localStorage.getItem(DEMO_BANNER_DISMISSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PORTFOLIO_SCOPE_STORAGE_KEY, selectedPortfolioId);
  }, [selectedPortfolioId]);

  useEffect(() => {
    if (!portfolios.length) {
      if (selectedPortfolioId) setSelectedPortfolioId("");
      return;
    }
    if (!selectedPortfolioId || !portfolios.some((portfolio) => portfolio.id === selectedPortfolioId)) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  useEffect(() => {
    if (loading || hasSupabaseEnv || userId !== "demo") return;
    saveLocalSnapshot({
      version: 1,
      portfolios,
      cashMovements,
      stocks,
      stockTags,
      portfolioStockOverrides,
      trades,
      positionAdjustments,
      settings
    });
  }, [cashMovements, loading, portfolioStockOverrides, portfolios, positionAdjustments, settings, stockTags, stocks, trades, userId]);

  useEffect(() => {
    if (!userId || !stockSignature) return;

    let cancelled = false;
    const run = async () => {
      if (cancelled || typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (!isTaiwanMarketHours()) return;
      await refreshQuotes(false);
    };

    if (isTaiwanMarketHours()) {
      void run();
    }
    const timer = window.setInterval(() => {
      void run();
    }, 90000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stockCatalog.length, stockSignature, userId]);

  async function initialize() {
    try {
      if (!hasSupabaseEnv || !supabase) {
        if (!loadLocalData()) seedDemoData();
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      setUserId(session?.user.id ?? null);
      if (session?.user.id) {
        await loadCloudData(session.user.id);
      } else {
        if (!loadLocalData()) seedDemoData();
      }

      supabase.auth.onAuthStateChange((_event, sessionValue) => {
        setUserId(sessionValue?.user.id ?? null);
        if (sessionValue?.user.id) {
          void loadCloudData(sessionValue.user.id);
        }
      });
    } catch (error) {
      console.error("Failed to initialize app", error);
      if (!loadLocalData()) seedDemoData();
      setMessage("初始化失敗，已切換成本機 demo 資料。");
    } finally {
      setLoading(false);
      void reloadStockCatalog(false);
    }
  }

  async function reloadStockCatalog(showResultMessage = true) {
    setCatalogLoading(true);
    try {
      const result = await loadStockCatalog();
      setStockCatalog(result.catalog);
      setCatalogSource(result.source);
      const catalogBySymbol = new Map(result.catalog.map((item) => [item.symbol, item]));
      if (supabase && hasSupabaseEnv) {
        const updates = stocks
          .map((stock) => {
            const catalogItem = catalogBySymbol.get(stock.symbol);
            if (!catalogItem) return null;
            const industry = resolveIndustryValue(stock.industry, catalogItem.industry);
            const name = catalogItem.name || stock.name;
            const market = catalogItem.market || stock.market;
            if (industry === stock.industry && name === stock.name && market === stock.market) return null;
            return { ...stock, name, market, industry, updated_at: new Date().toISOString() };
          })
          .filter((stock): stock is Stock => Boolean(stock));

        for (const stock of updates) {
          await supabase
            .from("stocks")
            .update({ name: stock.name, market: stock.market, industry: stock.industry, updated_at: stock.updated_at })
            .eq("id", stock.id);
        }
      }
      setStocks((current) =>
        current.map((stock) => {
          const catalogItem = catalogBySymbol.get(stock.symbol);
          if (!catalogItem) return stock;
          return {
            ...stock,
            name: catalogItem.name || stock.name,
            industry:
              stock.industry && stock.industry !== "未分類"
                ? stock.industry
                : catalogItem.industry || stock.industry
          };
        })
      );
      if (showResultMessage) {
        const sourceLabel = result.source === "api" ? "API" : result.source === "cache" ? "本地快取" : "fallback";
        setMessage("股票目錄已更新，來源：" + sourceLabel + "，共 " + result.catalog.length + " 檔。");
      }
    } catch (error) {
      console.error("Failed to load stock catalog", error);
      setMessage("股票目錄載入失敗，已保留目前可用資料。");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function getCatalogForSymbols(symbols: string[]) {
    const normalizedSymbols = [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))];
    const needsRefresh = normalizedSymbols.some((symbol) => !hasResolvedIndustry(findStockBySymbol(stockCatalog, symbol)?.industry));
    if (!needsRefresh) return stockCatalog;

    try {
      const result = await loadStockCatalog();
      setStockCatalog(result.catalog);
      setCatalogSource(result.source);
      return result.catalog;
    } catch (error) {
      console.error("Failed to ensure stock catalog", error);
      return stockCatalog;
    }
  }

  async function refreshQuotes(showResultMessage = true) {
    if (!stocks.length) {
      if (showResultMessage) setMessage("尚無股票可更新現價。");
      return;
    }

    await refreshQuotesForStocks(stocks, showResultMessage);
  }

  async function refreshQuotesForStocks(targetStocks: Stock[], showResultMessage = true) {
    if (!targetStocks.length) {
      if (showResultMessage) setMessage("尚無股票可更新現價。");
      return false;
    }

    setQuoteRefreshing(true);
    try {
      const response = await fetch("/api/stock-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: targetStocks.map((stock) => ({
            symbol: stock.symbol,
            market: catalogBySymbol.get(stock.symbol)?.market || stock.market || "TWSE"
          }))
        })
      });

      if (!response.ok) throw new Error("quote api failed");
      const payload = (await response.json()) as QuotePayload;
      const quoteMap = new Map(payload.quotes.map((quote) => [quote.symbol, quote]));
      const now = new Date().toISOString();
      let updatedCount = 0;

      const nextTargetStocks = targetStocks.map((stock) => {
        const quote = quoteMap.get(stock.symbol);
        if (!quote) return stock;
        updatedCount += 1;
        return {
          ...stock,
          market: quote.market || stock.market,
          current_price: quote.price,
          price_updated_at: quote.priceUpdatedAt,
          updated_at: now
        };
      });

      if (updatedCount && supabase && hasSupabaseEnv) {
        const updates = nextTargetStocks.filter(
          (stock, index) =>
            stock.current_price !== targetStocks[index]?.current_price ||
            stock.price_updated_at !== targetStocks[index]?.price_updated_at ||
            stock.market !== targetStocks[index]?.market
        );

        for (const stock of updates) {
          const { error } = await supabase
            .from("stocks")
            .update({
              market: stock.market,
              current_price: stock.current_price,
              price_updated_at: stock.price_updated_at,
              updated_at: stock.updated_at
            })
            .eq("id", stock.id);
          if (error) throw error;
        }
      }

      if (updatedCount) {
        setStocks((current) =>
          current.map((stock) => {
            const quote = quoteMap.get(stock.symbol);
            if (!quote) return stock;
            return {
              ...stock,
              market: quote.market || stock.market,
              current_price: quote.price,
              price_updated_at: quote.priceUpdatedAt,
              updated_at: now
            };
          })
        );
      }

      if (showResultMessage) {
        if (!updatedCount) {
          setMessage("目前查無可更新的盤中報價。");
        } else {
          const failed = payload.failedSymbols?.length ? `，${payload.failedSymbols.length} 檔暫時查無盤中報價` : "";
          setMessage(`現價已更新 ${updatedCount} 檔${failed}。`);
        }
      }
      return updatedCount > 0;
    } catch (error) {
      console.error("Failed to refresh quotes", error);
      if (showResultMessage) setMessage("更新現價失敗，請稍後再試。");
      return false;
    } finally {
      setQuoteRefreshing(false);
    }
  }

  function loadLocalData() {
    const snapshot = readLocalSnapshot();
    if (!snapshot) return false;
    setUserId("demo");
    setSettings({ ...snapshot.settings, user_id: "demo" });
    setPortfolios(snapshot.portfolios.map(normalizePortfolio));
    setCashMovements(snapshot.cashMovements.map(normalizeCashMovement));
    setStocks(snapshot.stocks.map(normalizeStock));
    setStockTags(snapshot.stockTags);
    setPortfolioStockOverrides((snapshot.portfolioStockOverrides ?? []).map(normalizePortfolioStockOverride));
    setTrades(snapshot.trades.map(normalizeTrade));
    setPositionAdjustments((snapshot.positionAdjustments ?? []).map(normalizePositionAdjustment));
    setMessage("已載入本機儲存資料。");
    return true;
  }

  function seedDemoData() {
    const demoUser = "demo";
    const portfolioId = uid();
    const stockA = uid();
    const stockB = uid();
    const now = new Date().toISOString();

    setUserId(demoUser);
    setSettings({ ...DEFAULT_SETTINGS, user_id: demoUser });
    setCashMovements([]);
    setPositionAdjustments([]);
    setPortfolios([
      {
        id: portfolioId,
        user_id: demoUser,
        name: "台股主帳本",
        currency: "TWD",
        initial_amount: 300000,
        cash_balance: 138970.86,
        total_deposits: 300000,
        total_withdrawals: 0,
        note: "Demo data",
        created_at: now,
        updated_at: now
      }
    ]);
    setStocks([
      {
        id: stockA,
        user_id: demoUser,
        symbol: "2330",
        name: "台積電",
        market: "TWSE",
        industry: "半導體",
        current_price: 980,
        price_updated_at: now,
        created_at: now,
        updated_at: now
      },
      {
        id: stockB,
        user_id: demoUser,
        symbol: "0050",
        name: "元大台灣50",
        market: "TWSE",
        industry: "ETF",
        current_price: 176,
        price_updated_at: now,
        created_at: now,
        updated_at: now
      }
    ]);
    setStockTags([
      { id: uid(), user_id: demoUser, stock_id: stockA, name: "核心" },
      { id: uid(), user_id: demoUser, stock_id: stockB, name: "長期" }
    ]);
    setTrades([
      makeTrade({ id: uid(), userId: demoUser, portfolioId, stockId: stockA, type: "buy", quantity: 100, unitPrice: 920, settings: DEFAULT_SETTINGS, tradedAt: today(), createdAt: now }),
      makeTrade({ id: uid(), userId: demoUser, portfolioId, stockId: stockB, type: "buy", quantity: 400, unitPrice: 172, settings: DEFAULT_SETTINGS, tradedAt: today(), createdAt: now })
    ]);
  }

  async function loadCloudData(uidValue: string) {
    if (!supabase) return;
    const [portfolioResult, stockResult, tagResult, overrideResult, tradeResult, cashResult, settingsResult, adjustmentsResult] = await Promise.all([
      supabase.from("portfolios").select("*").order("created_at", { ascending: true }),
      supabase.from("stocks").select("*").order("symbol", { ascending: true }),
      supabase.from("stock_tags").select("*").order("name", { ascending: true }),
      supabase.from("portfolio_stock_overrides").select("*").order("updated_at", { ascending: false }),
      supabase.from("trades").select("*, stock:stocks(*)").order("traded_at", { ascending: false }),
      supabase.from("cash_movements").select("*").order("occurred_at", { ascending: false }),
      supabase.from("settings").select("*").eq("user_id", uidValue).maybeSingle(),
      supabase.from("position_adjustments").select("*").order("updated_at", { ascending: false })
    ]);

    const warnings: string[] = [];

    if (portfolioResult.error) {
      console.error("Failed to load portfolios", portfolioResult.error);
      warnings.push("帳本");
    } else {
      setPortfolios((portfolioResult.data ?? []).map(normalizePortfolio));
    }

    if (stockResult.error) {
      console.error("Failed to load stocks", stockResult.error);
      warnings.push("股票");
    } else {
      setStocks((stockResult.data ?? []).map(normalizeStock));
    }

    if (tagResult.error) {
      console.error("Failed to load stock tags", tagResult.error);
      warnings.push("標籤");
    } else {
      setStockTags((tagResult.data ?? []) as StockTag[]);
    }

    if (overrideResult.error) {
      console.error("Failed to load portfolio stock overrides", overrideResult.error);
      warnings.push("持股分類");
    } else {
      setPortfolioStockOverrides((overrideResult.data ?? []).map(normalizePortfolioStockOverride));
    }

    if (tradeResult.error) {
      console.error("Failed to load trades", tradeResult.error);
      warnings.push("交易");
    } else {
      setTrades((tradeResult.data ?? []).map(normalizeTrade));
    }

    if (cashResult.error) {
      console.error("Failed to load cash movements", cashResult.error);
      warnings.push("資金異動");
    } else {
      setCashMovements((cashResult.data ?? []).map(normalizeCashMovement));
    }

    if (adjustmentsResult.error) {
      console.error("Failed to load position adjustments", adjustmentsResult.error);
      warnings.push("持股校正");
    } else {
      setPositionAdjustments((adjustmentsResult.data ?? []).map(normalizePositionAdjustment));
    }

    if (settingsResult.error) {
      console.error("Failed to load settings", settingsResult.error);
      warnings.push("設定");
    } else {
      setSettings(settingsResult.data ? normalizeSettings(settingsResult.data) : { ...DEFAULT_SETTINGS, user_id: uidValue });
    }

    if (warnings.length) {
      setMessage("部分雲端資料載入失敗，已保留目前畫面資料：" + warnings.join("、") + "。");
    }
  }

  async function reloadCloudDataAfterWrite() {
    if (!supabase || !hasSupabaseEnv || !userId || userId === "demo") return;
    await loadCloudData(userId);
  }

  async function signIn() {
    setMessage("");
    if (!supabase) {
      setMessage("目前未設定 Supabase，已使用本機 demo 資料。");
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    setMessage(error ? error.message : "登入連結已寄出，請檢查 Email。");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUserId(null);
  }

  function dismissDemoBanner() {
    setDemoBannerDismissed(true);
    if (typeof window !== "undefined") window.localStorage.setItem(DEMO_BANNER_DISMISSED_KEY, "1");
  }

  function openNewPortfolio() {
    setEditingPortfolioId(null);
    setPortfolioDraft({ name: "", initialAmount: "", note: "" });
    setFormError("");
    setSheetMode("portfolio");
  }

  function openRenamePortfolio(portfolio: Portfolio) {
    setEditingPortfolioId(portfolio.id);
    setPortfolioDraft({
      name: portfolio.name,
      initialAmount: String(portfolio.initial_amount),
      note: portfolio.note ?? ""
    });
    setFormError("");
    setSheetMode("portfolio");
  }

  function openCashForPortfolio(portfolioId?: string) {
    setCashDraft({
      portfolioId: portfolioId || activePortfolioId || portfolios[0]?.id || "",
      type: "deposit",
      amount: "",
      note: ""
    });
    setFormError("");
    setSheetMode("cash");
  }

  async function savePortfolio() {
    setFormError("");
    const parsed = portfolioSchema.safeParse(portfolioDraft);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    const now = new Date().toISOString();
    let successMessage = "";

    if (editingPortfolioId) {
      const currentPortfolio = portfolios.find((item) => item.id === editingPortfolioId);
      if (!currentPortfolio) return setFormError("找不到帳本");
      const nextPortfolio: Portfolio = {
        ...currentPortfolio,
        name: parsed.data.name,
        note: parsed.data.note || null,
        updated_at: now
      };
      if (supabase && hasSupabaseEnv) {
        const { error } = await supabase
          .from("portfolios")
          .update({ name: nextPortfolio.name, note: nextPortfolio.note, updated_at: nextPortfolio.updated_at })
          .eq("id", editingPortfolioId);
        if (error) return setFormError(toUserError(error, "重新命名帳本失敗。"));
      }
      setPortfolios((current) => current.map((item) => (item.id === editingPortfolioId ? nextPortfolio : item)));
      successMessage = "帳本已重新命名。";
    } else {
      const id = uid();
      const amount = parsed.data.initialAmount;
      const item: Portfolio = {
        id,
        user_id: userId ?? "demo",
        name: parsed.data.name,
        currency: "TWD",
        initial_amount: amount,
        cash_balance: amount,
        total_deposits: amount,
        total_withdrawals: 0,
        note: parsed.data.note || null,
        created_at: now,
        updated_at: now
      };

      if (supabase && hasSupabaseEnv) {
        const { error } = await supabase.from("portfolios").insert(item);
        if (error) return setFormError(toUserError(error, "新增帳本失敗。"));
      }
      setPortfolios((current) => [...current, item]);
      if (!selectedPortfolioId) setSelectedPortfolioId(id);
      successMessage = "帳本已新增。";
    }

    setEditingPortfolioId(null);
    setPortfolioDraft({ name: "", initialAmount: "", note: "" });
    await reloadCloudDataAfterWrite();
    setMessage(successMessage);
    setSheetMode(null);
  }

  function requestSavePortfolio() {
    if (editingPortfolioId) {
      setConfirmState({ kind: "renamePortfolio" });
      return;
    }
    void savePortfolio();
  }

  function requestDeletePortfolio(portfolio: Portfolio) {
    setConfirmState({ kind: "deletePortfolio", portfolio });
  }

  async function deletePortfolio(portfolio: Portfolio) {
    setFormError("");

    if (supabase && hasSupabaseEnv) {
      const { error } = await supabase.rpc("delete_portfolio_transaction", { p_portfolio_id: portfolio.id });
      if (error) return setFormError(toUserError(error, "刪除帳本失敗，相關資料未完整同步刪除。請確認已執行最新版 supabase/schema.sql。"));
    }

    setTrades((current) => current.filter((item) => item.portfolio_id !== portfolio.id));
    setCashMovements((current) => current.filter((item) => item.portfolio_id !== portfolio.id));
    setPositionAdjustments((current) => current.filter((item) => item.portfolio_id !== portfolio.id));
    const remainingPortfolios = portfolios.filter((item) => item.id !== portfolio.id);
    setPortfolios(remainingPortfolios);
    if (activePortfolioId === portfolio.id) setSelectedPortfolioId(remainingPortfolios[0]?.id ?? "");
    await reloadCloudDataAfterWrite();
    setMessage("帳本已刪除。");
  }

  async function createCashMovement() {
    setFormError("");
    const parsed = cashSchema.safeParse({ ...cashDraft, portfolioId: cashDraft.portfolioId || portfolios[0]?.id || "" });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    const portfolio = portfolios.find((item) => item.id === parsed.data.portfolioId);
    if (!portfolio) return setFormError("找不到帳本");
    if (parsed.data.type === "withdraw" && parsed.data.amount > portfolio.cash_balance) return setFormError("轉出金額不可超過現金餘額");

    const nextCash =
      parsed.data.type === "deposit"
        ? portfolio.cash_balance + parsed.data.amount
        : parsed.data.type === "withdraw"
          ? portfolio.cash_balance - parsed.data.amount
          : parsed.data.amount;
    const nextPortfolio: Portfolio = {
      ...portfolio,
      cash_balance: nextCash,
      total_deposits: parsed.data.type === "deposit" ? portfolio.total_deposits + parsed.data.amount : portfolio.total_deposits,
      total_withdrawals:
        parsed.data.type === "withdraw" ? portfolio.total_withdrawals + parsed.data.amount : portfolio.total_withdrawals,
      updated_at: new Date().toISOString()
    };
    const movement: CashMovement = {
      id: uid(),
      user_id: userId ?? "demo",
      portfolio_id: portfolio.id,
      type: parsed.data.type,
      amount: parsed.data.amount,
      balance_after: nextCash,
      occurred_at: today(),
      note: parsed.data.note || null
    };

    if (supabase && hasSupabaseEnv) {
      const { data, error } = await supabase.rpc("save_cash_movement_transaction", {
        p_portfolio_id: portfolio.id,
        p_type: parsed.data.type,
        p_amount: parsed.data.amount,
        p_occurred_at: movement.occurred_at,
        p_note: movement.note
      });
      if (error) return setFormError(toUserError(error, "儲存資金異動失敗，帳本與流水未同步完成。請確認已執行最新版 supabase/schema.sql。"));

      const payload = data as { portfolio?: Record<string, unknown>; movement?: Record<string, unknown> } | null;
      const syncedPortfolio = payload?.portfolio ? normalizePortfolio(payload.portfolio) : nextPortfolio;
      const syncedMovement = payload?.movement ? normalizeCashMovement(payload.movement) : movement;
      setPortfolios((current) => current.map((item) => (item.id === portfolio.id ? syncedPortfolio : item)));
      setCashMovements((current) => [syncedMovement, ...current]);
    } else {
      setPortfolios((current) => current.map((item) => (item.id === portfolio.id ? nextPortfolio : item)));
      setCashMovements((current) => [movement, ...current]);
    }

    setCashDraft({ portfolioId: portfolio.id, type: "deposit", amount: "", note: "" });
    await reloadCloudDataAfterWrite();
    setMessage("資金異動已儲存。");
    setSheetMode(null);
  }

  function requestCreateCashMovement() {
    setConfirmState({ kind: "cashMovement" });
  }

  function requestSaveTrade() {
    if (editingTradeId) {
      setConfirmState({ kind: "updateTrade" });
      return;
    }
    void saveTrade();
  }

  async function saveTrade() {
    setFormError("");
    const derivedUnitPrice =
      tradeDraft.buyMode === "totalAmount"
        ? Number(tradeDraft.quantity || 0) > 0
          ? resolveUnitPriceFromTotalAmount({
              type: tradeDraft.type,
              quantity: Number(tradeDraft.quantity || 0),
              totalAmount: parseNumericInput(tradeDraft.totalAmount || "0"),
              settings,
              totalAmountIncludesFees: tradeDraft.type === "sell" && tradeDraft.totalAmountIncludesFees
            })
          : 0
        : Number(tradeDraft.unitPrice || 0);
    const parsed = tradeSchema.safeParse({
      ...tradeDraft,
      portfolioId: tradeDraft.portfolioId || defaultTradePortfolioId,
      unitPrice: derivedUnitPrice
    });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    if (tradeDraft.buyMode === "totalAmount" && parseNumericInput(tradeDraft.totalAmount || "0") <= 0) {
      return setFormError((tradeDraft.type === "buy" ? "買入" : "賣出") + "金額需大於 0");
    }
    const portfolio = portfolios.find((item) => item.id === parsed.data.portfolioId);
    if (!portfolio) return setFormError("找不到帳本");
    const editingTrade = editingTradeId ? (trades.find((trade) => trade.id === editingTradeId) ?? null) : null;

    const tradeCatalog = await getCatalogForSymbols([parsed.data.symbol]);
    const catalogStock = findStockBySymbol(tradeCatalog, parsed.data.symbol);
    const displayName = catalogStock?.name || parsed.data.name;
    const existingStock = stocks.find((item) => item.symbol === parsed.data.symbol);
    const globalIndustry = resolveIndustryValue(existingStock?.industry, catalogStock?.industry);
    const stock: Stock =
      existingStock
        ? {
            ...existingStock,
            name: displayName,
            market: catalogStock?.market || existingStock.market,
            industry: globalIndustry,
            updated_at: new Date().toISOString()
          }
        :
      ({
        id: uid(),
        user_id: userId ?? "demo",
        symbol: parsed.data.symbol,
        name: displayName,
        market: catalogStock?.market || "TWSE",
        industry: globalIndustry,
        current_price: parsed.data.unitPrice,
        price_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } satisfies Stock);

    const amounts = calculateTradeAmounts({
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      settings
    });

    if (parsed.data.type === "sell" && !editingTrade) {
      const tradesForValidation = trades;
      const validationPositions = buildPositions(
        tradesForValidation,
        existingStock ? stocks : [...stocks, stock],
        stockTags,
        positionAdjustments,
        portfolioStockOverrides
      );
      const position = validationPositions.find((item) => item.stock_id === stock.id && item.portfolio_id === portfolio.id);
      if (!position || parsed.data.quantity > position.quantity) return setFormError("可賣股數不足，目前可賣 " + (position?.quantity ?? 0));
    }
    const oldImpact = editingTrade ? tradeCashImpact(editingTrade) : 0;
    const availableCash = editingTrade?.portfolio_id === portfolio.id ? portfolio.cash_balance - oldImpact : portfolio.cash_balance;
    if (parsed.data.type === "buy" && !settings.allow_negative_cash && amounts.netAmount > availableCash) {
      return setFormError("現金餘額不足。可到設定開啟允許負現金。");
    }

    const tradeBase = makeTrade({
      id: uid(),
      userId: userId ?? "demo",
      portfolioId: portfolio.id,
      stockId: stock.id,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      settings,
      tradedAt: parsed.data.tradedAt,
      createdAt: new Date().toISOString(),
      note: null
    });
    const trade: Trade = editingTrade
      ? { ...tradeBase, id: editingTrade.id, created_at: editingTrade.created_at }
      : tradeBase;
    const nextTrades = editingTrade ? trades.map((item) => (item.id === trade.id ? trade : item)) : [trade, ...trades];
    const shouldValidateOversold =
      parsed.data.type === "sell" ||
      Boolean(
        editingTrade &&
          (editingTrade.type === "sell" ||
            editingTrade.quantity > parsed.data.quantity ||
            editingTrade.stock_id !== stock.id ||
            editingTrade.portfolio_id !== portfolio.id)
      );
    if (shouldValidateOversold) {
      const scopes = [{ portfolioId: portfolio.id, stockId: stock.id }];
      if (editingTrade && (editingTrade.portfolio_id !== portfolio.id || editingTrade.stock_id !== stock.id)) {
        scopes.push({ portfolioId: editingTrade.portfolio_id, stockId: editingTrade.stock_id });
      }
      if (scopes.some((scope) => hasOversoldPosition(nextTrades, scope))) {
        return setFormError("此修改會造成某檔股票賣出股數超過持有股數，請先調整相關交易。");
      }
    }
    const tagRows = parseTags(parsed.data.tags).map((name) => ({
      id: uid(),
      user_id: userId ?? "demo",
      portfolio_id: portfolio.id,
      stock_id: stock.id,
      name
    }));
    const portfolioUpdates = buildPortfolioUpdates(portfolios, editingTrade, trade, new Date().toISOString());

    if (supabase && hasSupabaseEnv) {
      const { error: tradeError } = await supabase.rpc("save_trade_transaction", {
        p_stock: stock,
        p_trade: trade,
        p_tag_names: tagRows.map((tag) => tag.name),
        p_industry_override: parsed.data.industry?.trim() || null,
        p_portfolio_updates: portfolioUpdates.map((nextPortfolio) => ({
          id: nextPortfolio.id,
          cash_balance: nextPortfolio.cash_balance,
          updated_at: nextPortfolio.updated_at
        }))
      });
      if (tradeError) {
        return setFormError(toUserError(tradeError, "儲存交易失敗，資料庫未完成股票、交易、標籤與現金同步更新。請確認已執行最新版 supabase/schema.sql。"));
      }
    }

    setStocks((current) => (existingStock ? current.map((item) => (item.id === stock.id ? stock : item)) : [...current, stock]));
    setPortfolioStockOverrides((current) => {
      const existingOverride = current.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id);
      const filtered = current.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock.id));
      const industryOverride = parsed.data.industry?.trim();
      if (!industryOverride) return filtered;
      return [
        ...filtered,
        {
          id: existingOverride?.id ?? uid(),
          user_id: userId ?? "demo",
          portfolio_id: portfolio.id,
          stock_id: stock.id,
          industry_override: industryOverride,
          created_at: existingOverride?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
    });
    setStockTags((current) => [...current.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock.id)), ...tagRows]);
    setTrades(nextTrades);
    setPortfolios((current) =>
      current.map((item) => portfolioUpdates.find((nextPortfolio) => nextPortfolio.id === item.id) ?? item)
    );
    setEditingTradeId(null);
    setTradeDraft({ ...emptyTradeDraft, portfolioId: portfolio.id });
    setFormError("");
    await reloadCloudDataAfterWrite();
    const quoteUpdated = await refreshQuotesForStocks([stock], false);
    if (quoteUpdated) await reloadCloudDataAfterWrite();
    setMessage(quoteUpdated ? "儲存成功，現價已更新。" : "儲存成功，但現價暫時未更新。");
    setSheetMode(null);
  }

  async function deleteTrade(trade: Trade) {
    setFormError("");
    const portfolio = portfolios.find((item) => item.id === trade.portfolio_id);
    if (!portfolio) {
      setMessage("刪除失敗：找不到帳本。");
      return setFormError("找不到帳本");
    }
    const nextTrades = trades.filter((item) => item.id !== trade.id);
    if (hasOversoldPosition(nextTrades, { portfolioId: trade.portfolio_id, stockId: trade.stock_id })) {
      const error = "刪除此交易會造成後續賣出股數超過持股，請先調整相關交易。";
      setMessage(error);
      return setFormError(error);
    }
    const nextPortfolio = deleteTradeFromPortfolios(portfolios, trade, new Date().toISOString()).find((item) => item.id === portfolio.id);
    if (!nextPortfolio) {
      setMessage("刪除失敗：找不到帳本。");
      return setFormError("找不到帳本");
    }

    if (supabase && hasSupabaseEnv) {
      const { error: deleteError } = await supabase.rpc("delete_trade_transaction", { p_trade_id: trade.id });
      if (deleteError) {
        const error = toUserError(deleteError, "刪除交易失敗，資料庫未完成交易與現金同步更新。請確認已執行最新版 supabase/schema.sql。");
        setMessage(error);
        return setFormError(error);
      }
    }

    setTrades(nextTrades);
    setPortfolios((current) => current.map((item) => (item.id === nextPortfolio.id ? nextPortfolio : item)));
    setFormError("");
    await reloadCloudDataAfterWrite();
    setMessage("交易已刪除。");
  }

  function requestDeleteTrade(trade: Trade) {
    setConfirmState({ kind: "deleteTrade", trade });
  }

  function getScopedTagNames(stockId: string, portfolioId: string) {
    const scopedTags = stockTags.filter((tag) => tag.stock_id === stockId && tag.portfolio_id === portfolioId).map((tag) => tag.name);
    if (scopedTags.length > 0) return scopedTags;
    return stockTags.filter((tag) => tag.stock_id === stockId && tag.portfolio_id == null).map((tag) => tag.name);
  }

  function openEditTrade(trade: Trade) {
    const stock = stocks.find((item) => item.id === trade.stock_id);
    const scopedOverride = portfolioStockOverrides.find((item) => item.portfolio_id === trade.portfolio_id && item.stock_id === trade.stock_id);
    const tagNames = getScopedTagNames(trade.stock_id, trade.portfolio_id);
    setEditingTradeId(trade.id);
    setTradeDraft({
      portfolioId: trade.portfolio_id,
      type: trade.type,
      buyMode: "unitPrice",
      tradedAt: trade.traded_at,
      symbol: stock?.symbol ?? "",
      name: stock?.name ?? "",
      quantity: String(trade.quantity),
      unitPrice: String(trade.unit_price),
      totalAmount: String(trade.type === "buy" ? trade.net_amount : trade.gross_amount),
      totalAmountIncludesFees: false,
      industry: scopedOverride?.industry_override ?? stock?.industry ?? "",
      tags: tagNames.join(", ")
    });
    setSheetMode("trade");
  }

  function openNewTrade(type: TradeType) {
    setEditingTradeId(null);
    setTradeDraft({ ...emptyTradeDraft, tradedAt: today(), portfolioId: defaultTradePortfolioId, type });
    setSheetMode("trade");
  }

  function openStockAdjustEditor(position: Position) {
    const adjustment = positionAdjustments.find((item) => item.portfolio_id === position.portfolio_id && item.stock_id === position.stock_id);
    const override = portfolioStockOverrides.find((item) => item.portfolio_id === position.portfolio_id && item.stock_id === position.stock_id);
    setStockDraft({
      stockId: position.stock_id,
      portfolioId: position.portfolio_id,
      currentPrice: String(position.current_price),
      quantity: String(adjustment?.adjusted_quantity ?? position.quantity),
      holdingCost: String(adjustment?.adjusted_cost ?? position.holding_cost),
      industry: override?.industry_override ?? (position.industry === "未分類" ? "" : position.industry),
      tags: position.tags.join(", ")
    });
    setStockAdjustBaseline({
      quantity: position.quantity,
      holdingCost: position.holding_cost
    });
    setSheetMode("stockAdjust");
  }

  function requestStockAdjustment() {
    setFormError("");
    const parsed = stockSchema.safeParse(stockDraft);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    if (parsed.data.quantity === 0 && parsed.data.holdingCost > 0) return setFormError("持有庫存為 0 時，持有成本也必須為 0。");
    setConfirmState({ kind: "adjustCost", parsed: parsed.data });
  }

  async function updateStockAdjustment(parsed: z.infer<typeof stockSchema>) {
    setFormError("");
    const stock = stocks.find((item) => item.id === parsed.stockId);
    if (!stock) return setFormError("找不到股票");
    if (parsed.quantity === 0 && parsed.holdingCost > 0) return setFormError("持有庫存為 0 時，持有成本也必須為 0。");
    const overrideUpdatedAt = new Date().toISOString();
    const nextOverride: PortfolioStockOverride = {
      id: portfolioStockOverrides.find((item) => item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id)?.id ?? uid(),
      user_id: userId ?? "demo",
      portfolio_id: parsed.portfolioId,
      stock_id: stock.id,
      industry_override: parsed.industry?.trim() ? parsed.industry.trim() : null,
      created_at:
        portfolioStockOverrides.find((item) => item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id)?.created_at ?? overrideUpdatedAt,
      updated_at: overrideUpdatedAt
    };
    const nextAdjustment: PositionAdjustment = {
      id: positionAdjustments.find((item) => item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id)?.id ?? uid(),
      user_id: userId ?? "demo",
      portfolio_id: parsed.portfolioId,
      stock_id: stock.id,
      adjusted_quantity: parsed.quantity,
      adjusted_cost: parsed.holdingCost,
      created_at: positionAdjustments.find((item) => item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id)?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      baseline_traded_at: today(),
      baseline_created_at: new Date().toISOString()
    };
    const tagRows = parseTags(parsed.tags).map((name) => ({
      id: uid(),
      user_id: userId ?? "demo",
      portfolio_id: parsed.portfolioId,
      stock_id: stock.id,
      name
    }));

    if (supabase && hasSupabaseEnv) {
      const { error } = await supabase.rpc("save_position_adjustment_transaction", {
        p_stock: stock,
        p_adjustment: nextAdjustment,
        p_tag_names: tagRows.map((tag) => tag.name),
        p_industry_override: nextOverride.industry_override,
        p_delete_adjustment: parsed.quantity === 0 && parsed.holdingCost === 0
      });
      if (error) return setFormError(toUserError(error, "更新持股調整失敗，成本、分類與標籤未完整同步。請確認已執行最新版 supabase/schema.sql。"));
    }

    setPositionAdjustments((current) => {
      const filtered = current.filter((item) => !(item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id));
      return parsed.quantity === 0 && parsed.holdingCost === 0 ? filtered : [...filtered, nextAdjustment];
    });
    setPortfolioStockOverrides((current) => {
      const filtered = current.filter((item) => !(item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id));
      return nextOverride.industry_override ? [...filtered, nextOverride] : filtered;
    });
    setStockTags((current) => [...current.filter((item) => !(item.portfolio_id === parsed.portfolioId && item.stock_id === stock.id)), ...tagRows]);
    await reloadCloudDataAfterWrite();
    setMessage(supabase && hasSupabaseEnv ? "成本校正已更新。" : "成本校正已更新。");
    setConfirmState(null);
    setSheetMode(null);
  }

  async function updateSettings() {
    if (!supabase || !hasSupabaseEnv || !userId) {
      setMessage("設定已儲存。");
      return setSheetMode(null);
    }
    const { error } = await supabase.from("settings").upsert(settings);
    if (error) return setFormError(toUserError(error, "儲存設定失敗。"));
    setMessage("設定已儲存。");
    setSheetMode(null);
  }

  function currentSnapshot(): LocalSnapshot {
    return {
      version: 1,
      portfolios,
      cashMovements,
      stocks,
      stockTags,
      portfolioStockOverrides,
      trades,
      positionAdjustments,
      settings
    };
  }

  function exportJsonBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      app: "stock-ledger",
      data: currentSnapshot()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock-ledger-backup-" + today() + ".json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("JSON 備份已匯出。");
  }

  async function importJsonBackup(file: File) {
    setFormError("");
    if (supabase && hasSupabaseEnv && userId !== "demo") {
      setFormError("雲端模式目前不支援 JSON 覆蓋匯入，避免重新整理後被 Supabase 資料覆蓋。請改用交易 CSV 或持股 CSV 匯入。");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { data?: unknown };
      const snapshot = normalizeLocalSnapshot((parsed.data ?? parsed) as Partial<LocalSnapshot>);
      if (!snapshot) return setFormError("備份檔格式不正確，請選擇 Stock Ledger JSON 備份檔。");
      setConfirmState({ kind: "importJson", snapshot });
    } catch (error) {
      console.error("Failed to import backup", error);
      setFormError("備份檔讀取失敗，請確認檔案是有效 JSON。");
    }
  }

  async function importTradesCsv(file: File) {
    setFormError("");
    setCsvImportSummary(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return setFormError("CSV 內容為空。");

      const header = rows[0].map((value) => value.trim());
      const required = ["日期", "帳本", "買賣", "股票代號", "股票名稱", "股數", "成交單價"];
      const missing = required.filter((field) => !header.includes(field));
      if (missing.length) return setFormError("CSV 欄位缺少：" + missing.join("、"));

      const headerIndex = new Map(header.map((name, index) => [name, index]));
      const parsedRows = rows
        .slice(1)
        .map((row, index) => ({ row, line: index + 2 }))
        .filter(({ row }) => row.some((cell) => cell.trim()))
        .map(({ row, line }) => ({
          line,
          raw: row,
          tradedAt: row[headerIndex.get("日期") ?? -1] || today(),
          portfolioName: row[headerIndex.get("帳本") ?? -1] || "",
          type: row[headerIndex.get("買賣") ?? -1] || "",
          symbol: (row[headerIndex.get("股票代號") ?? -1] || "").trim(),
          name: (row[headerIndex.get("股票名稱") ?? -1] || "").trim(),
          quantity: Number((row[headerIndex.get("股數") ?? -1] || "").replace(/,/g, "")),
          unitPrice: Number((row[headerIndex.get("成交單價") ?? -1] || "").replace(/,/g, "")),
          industry: (row[headerIndex.get("產業別") ?? -1] || "").trim()
        }));

      let nextPortfolios = [...portfolios];
      let nextStocks = [...stocks];
      let nextTrades = [...trades];
      let nextPortfolioStockOverrides = [...portfolioStockOverrides];
      const skipped: CsvImportSummary["skipped"] = [];
      const importCatalog = await getCatalogForSymbols(parsedRows.map((row) => row.symbol));

      for (const row of parsedRows) {
        if (!row.portfolioName || !row.symbol || !row.name || !Number.isFinite(row.quantity) || !Number.isFinite(row.unitPrice) || row.quantity <= 0 || row.unitPrice <= 0) {
          skipped.push({ line: row.line, reason: "欄位缺漏或數值格式錯誤", raw: row.raw });
          continue;
        }
        const portfolio = nextPortfolios.find((item) => item.name === row.portfolioName);
        if (!portfolio) {
          skipped.push({ line: row.line, reason: "找不到對應帳本名稱", raw: row.raw });
          continue;
        }
        const tradeType: TradeType = row.type.includes("賣") ? "sell" : "buy";

        let stock = nextStocks.find((item) => item.symbol === row.symbol);
        const catalogMatch = findStockBySymbol(importCatalog, row.symbol);
        const globalIndustry = resolveIndustryValue(stock?.industry, catalogMatch?.industry);
        const resolvedIndustry = resolveIndustryValue(row.industry, globalIndustry);
        if (!stock) {
          stock = {
            id: uid(),
            user_id: userId ?? "demo",
            symbol: row.symbol,
            name: row.name,
            market: catalogMatch?.market || "TWSE",
            industry: globalIndustry ?? resolvedIndustry,
            current_price: row.unitPrice,
            price_updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          nextStocks.push(stock);
        } else if (globalIndustry !== stock.industry) {
          stock = {
            ...stock,
            industry: globalIndustry,
            updated_at: new Date().toISOString()
          };
          nextStocks = nextStocks.map((item) => (item.id === stock!.id ? stock! : item));
        }

        if (resolvedIndustry) {
          const nextOverride: PortfolioStockOverride = {
            id: nextPortfolioStockOverrides.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id)?.id ?? uid(),
            user_id: userId ?? "demo",
            portfolio_id: portfolio.id,
            stock_id: stock.id,
            industry_override: resolvedIndustry,
            created_at:
              nextPortfolioStockOverrides.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id)?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          nextPortfolioStockOverrides = [
            ...nextPortfolioStockOverrides.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock!.id)),
            nextOverride
          ];
        }

        const createdAt = new Date().toISOString();
        const trade = makeTrade({
          id: uid(),
          userId: userId ?? "demo",
          portfolioId: portfolio.id,
          stockId: stock.id,
          type: tradeType,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          settings,
          tradedAt: row.tradedAt || today(),
          createdAt
        });

        const candidateTrades = [trade, ...nextTrades];
        if (hasOversoldPosition(candidateTrades, { portfolioId: portfolio.id, stockId: stock.id })) {
          skipped.push({ line: row.line, reason: "賣出股數超過可持有數量", raw: row.raw });
          continue;
        }
        if (tradeType === "buy" && !settings.allow_negative_cash) {
          const currentPortfolio = nextPortfolios.find((item) => item.id === portfolio.id);
          if (!currentPortfolio || currentPortfolio.cash_balance < trade.net_amount) {
            skipped.push({ line: row.line, reason: "帳本現金不足，買入交易未匯入", raw: row.raw });
            continue;
          }
        }

        nextTrades = candidateTrades;
        nextPortfolios = nextPortfolios.map((item) =>
          item.id === portfolio.id ? { ...item, cash_balance: item.cash_balance + tradeCashImpact(trade), updated_at: createdAt } : item
        );
      }

      if (supabase && hasSupabaseEnv) {
        const changedStocks = nextStocks.filter((stock) => {
          const old = stocks.find((item) => item.id === stock.id);
          return !old || old.name !== stock.name || old.market !== stock.market || old.industry !== stock.industry || old.current_price !== stock.current_price || old.price_updated_at !== stock.price_updated_at;
        });
        const changedOverrides = nextPortfolioStockOverrides.filter((override) => {
          const old = portfolioStockOverrides.find((item) => item.id === override.id);
          return !old || old.industry_override !== override.industry_override;
        });
        const importedTrades = nextTrades.filter((trade) => !trades.some((old) => old.id === trade.id));
        const changedPortfolios = nextPortfolios
          .filter((portfolio) => {
            const old = portfolios.find((item) => item.id === portfolio.id);
            return old && old.cash_balance !== portfolio.cash_balance;
          })
          .map((portfolio) => ({
            id: portfolio.id,
            cash_balance: portfolio.cash_balance,
            updated_at: portfolio.updated_at
          }));
        const { error: importError } = await supabase.rpc("import_trades_transaction", {
          p_stocks: changedStocks,
          p_trades: importedTrades,
          p_portfolio_stock_overrides: changedOverrides,
          p_portfolio_updates: changedPortfolios
        });
        if (importError) return setFormError(toUserError(importError, "匯入交易失敗，資料庫未完成股票、交易與現金同步更新。請確認已執行最新版 supabase/schema.sql。"));
      }

      setStocks(nextStocks);
      setPortfolioStockOverrides(nextPortfolioStockOverrides);
      setTrades(nextTrades);
      setPortfolios(nextPortfolios);
      const importedCount = nextTrades.length - trades.length;
      const reasonBuckets = [
        { label: "欄位錯誤", count: skipped.filter((item) => item.reason.includes("欄位缺漏")).length },
        { label: "無帳本", count: skipped.filter((item) => item.reason.includes("帳本")).length },
        { label: "賣超", count: skipped.filter((item) => item.reason.includes("賣出股數超過")).length },
        { label: "現金不足", count: skipped.filter((item) => item.reason.includes("現金不足")).length }
      ].filter((item) => item.count > 0).slice(0, 3);
      setCsvImportSummary({
        totalRows: parsedRows.length,
        importedCount,
        skipped
      });
      await reloadCloudDataAfterWrite();
      setMessage(
        "匯入成功：新增 " +
          importedCount +
          "、略過 " +
          skipped.length +
          (reasonBuckets.length ? "。主因：" + reasonBuckets.map((item) => item.label + " " + item.count).join("、") : "")
      );
    } catch (error) {
      console.error("Failed to import CSV", error);
      setFormError("CSV 解析失敗，請確認格式與欄位。");
    }
  }

  async function requestImportTradesCsv(file: File) {
    setFormError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return setFormError("CSV 內容為空。");
      const totalRows = rows
        .slice(1)
        .filter((row) => row.some((cell) => cell.trim())).length;
      setConfirmState({ kind: "importCsv", file, totalRows });
    } catch (error) {
      console.error("Failed to inspect CSV", error);
      setFormError("CSV 讀取失敗，請確認檔案格式。");
    }
  }

  async function importHoldingsCsv(file: File) {
    setFormError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return setFormError("CSV 內容為空。");

      const header = rows[0].map((value) => value.trim());
      const required = ["帳本", "股票代號", "股票名稱", "持有股數", "持有成本"];
      const missing = required.filter((field) => !header.includes(field));
      if (missing.length) return setFormError("CSV 欄位缺少：" + missing.join("、"));

      const headerIndex = new Map(header.map((name, index) => [name, index]));
      const parsedRows = rows
        .slice(1)
        .map((row, index) => ({ row, line: index + 2 }))
        .filter(({ row }) => row.some((cell) => cell.trim()))
        .map(({ row, line }) => ({
          line,
          raw: row,
          portfolioName: (row[headerIndex.get("帳本") ?? -1] || "").trim(),
          symbol: (row[headerIndex.get("股票代號") ?? -1] || "").trim(),
          name: (row[headerIndex.get("股票名稱") ?? -1] || "").trim(),
          quantity: Number((row[headerIndex.get("持有股數") ?? -1] || "").replace(/,/g, "")),
          holdingCost: Number((row[headerIndex.get("持有成本") ?? -1] || "").replace(/,/g, "")),
          currentPrice: Number((row[headerIndex.get("目前價格") ?? -1] || "").replace(/,/g, "")),
          industry: (row[headerIndex.get("產業別") ?? -1] || "").trim(),
          tags: (row[headerIndex.get("標籤") ?? -1] || "").trim()
        }));

      let nextStocks = [...stocks];
      let nextAdjustments = [...positionAdjustments];
      let nextTags = [...stockTags];
      let nextPortfolioStockOverrides = [...portfolioStockOverrides];
      const skipped: CsvImportSummary["skipped"] = [];
      const affectedPairs = new Set<string>();
      const deletedAdjustmentKeys = new Set<string>();
      const now = new Date().toISOString();
      const holdingsCatalog = await getCatalogForSymbols(parsedRows.map((row) => row.symbol));

      for (const row of parsedRows) {
        if (!row.portfolioName || !row.symbol || !row.name || !Number.isFinite(row.quantity) || !Number.isFinite(row.holdingCost) || row.quantity < 0 || row.holdingCost < 0) {
          skipped.push({ line: row.line, reason: "欄位缺漏或數值格式錯誤", raw: row.raw });
          continue;
        }
        const portfolio = portfolios.find((item) => item.name === row.portfolioName);
        if (!portfolio) {
          skipped.push({ line: row.line, reason: "找不到對應帳本名稱", raw: row.raw });
          continue;
        }
        if (row.quantity === 0 && row.holdingCost > 0) {
          skipped.push({ line: row.line, reason: "持有股數為 0 時，持有成本必須為 0", raw: row.raw });
          continue;
        }

        const catalogMatch = findStockBySymbol(holdingsCatalog, row.symbol);
        let stock = nextStocks.find((item) => item.symbol === row.symbol);
        const nextPrice = Number.isFinite(row.currentPrice) && row.currentPrice > 0 ? row.currentPrice : stock?.current_price ?? 0;
        const globalIndustry = resolveIndustryValue(stock?.industry, catalogMatch?.industry);
        if (!stock) {
          stock = {
            id: uid(),
            user_id: userId ?? "demo",
            symbol: row.symbol,
            name: row.name,
            market: catalogMatch?.market || "TWSE",
            industry: globalIndustry ?? row.industry ?? null,
            current_price: nextPrice,
            price_updated_at: nextPrice > 0 ? now : null,
            created_at: now,
            updated_at: now
          };
          nextStocks.push(stock);
        } else {
          stock = {
            ...stock,
            name: row.name || stock.name,
            market: stock.market || catalogMatch?.market || "TWSE",
            industry: globalIndustry ?? stock.industry,
            current_price: nextPrice,
            price_updated_at: nextPrice > 0 ? now : stock.price_updated_at,
            updated_at: now
          };
          nextStocks = nextStocks.map((item) => (item.id === stock!.id ? stock! : item));
        }

        const oldAdjustment = nextAdjustments.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id);
        const nextAdjustment: PositionAdjustment = {
          id: oldAdjustment?.id ?? uid(),
          user_id: userId ?? "demo",
          portfolio_id: portfolio.id,
          stock_id: stock.id,
          adjusted_quantity: row.quantity,
          adjusted_cost: row.holdingCost,
          created_at: oldAdjustment?.created_at ?? now,
          updated_at: now,
          baseline_traded_at: today(),
          baseline_created_at: now
        };
        nextAdjustments = nextAdjustments.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock!.id));
        if (row.quantity === 0 && row.holdingCost === 0) {
          deletedAdjustmentKeys.add(`${portfolio.id}:${stock.id}`);
        } else {
          nextAdjustments.push(nextAdjustment);
        }

        const nextOverride: PortfolioStockOverride = {
          id: nextPortfolioStockOverrides.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id)?.id ?? uid(),
          user_id: userId ?? "demo",
          portfolio_id: portfolio.id,
          stock_id: stock.id,
          industry_override: row.industry || null,
          created_at: nextPortfolioStockOverrides.find((item) => item.portfolio_id === portfolio.id && item.stock_id === stock.id)?.created_at ?? now,
          updated_at: now
        };
        nextPortfolioStockOverrides = nextPortfolioStockOverrides.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock!.id));
        if (nextOverride.industry_override) nextPortfolioStockOverrides.push(nextOverride);

        const tagRows = parseTags(row.tags).map((name) => ({
          id: uid(),
          user_id: userId ?? "demo",
          portfolio_id: portfolio.id,
          stock_id: stock!.id,
          name
        }));
        nextTags = [...nextTags.filter((item) => !(item.portfolio_id === portfolio.id && item.stock_id === stock!.id)), ...tagRows];
        affectedPairs.add(`${portfolio.id}:${stock.id}`);
      }

      if (supabase && hasSupabaseEnv) {
        const newStocks = nextStocks.filter((stock) => !stocks.some((old) => old.id === stock.id));
        const deletedAdjustments = [...deletedAdjustmentKeys].map((key) => {
          const [portfolioId, stockId] = key.split(":");
          return { portfolio_id: portfolioId, stock_id: stockId };
        });
        const pairMatches = (portfolioId: string | null | undefined, stockId: string) => Boolean(portfolioId) && affectedPairs.has(`${portfolioId}:${stockId}`);
        const affectedTags = nextTags.filter((tag) => pairMatches(tag.portfolio_id, tag.stock_id));
        const affectedOverrides = nextPortfolioStockOverrides.filter((override) => pairMatches(override.portfolio_id, override.stock_id));
        const affectedStockIds = [...new Set([...affectedPairs].map((pair) => pair.split(":")[1]))];
        const affectedStockIdSet = new Set(affectedStockIds);
        const affectedPairRows = [...affectedPairs].map((pair) => {
          const [portfolio_id, stock_id] = pair.split(":");
          return { portfolio_id, stock_id };
        });
        const changedExistingStocks = nextStocks.filter((stock) => {
          const old = stocks.find((item) => item.id === stock.id);
          return old && affectedStockIdSet.has(stock.id) && (old.name !== stock.name || old.market !== stock.market || old.industry !== stock.industry || old.current_price !== stock.current_price || old.price_updated_at !== stock.price_updated_at);
        });
        const { error: importError } = await supabase.rpc("import_holdings_transaction", {
          p_stocks: [...newStocks, ...changedExistingStocks],
          p_adjustments: nextAdjustments.filter((item) => affectedStockIdSet.has(item.stock_id)),
          p_deleted_adjustments: deletedAdjustments,
          p_portfolio_stock_overrides: affectedOverrides,
          p_tags: affectedTags,
          p_affected_pairs: affectedPairRows
        });
        if (importError) return setFormError(toUserError(importError, "匯入持股失敗，資料庫未完成股票、成本校正與標籤同步更新。請確認已執行最新版 supabase/schema.sql。"));
      }

      setStocks(nextStocks);
      setPositionAdjustments(nextAdjustments);
      setPortfolioStockOverrides(nextPortfolioStockOverrides);
      setStockTags(nextTags);
      await reloadCloudDataAfterWrite();
      setMessage("持股匯入成功：更新 " + affectedPairs.size + " 筆持股、略過 " + skipped.length + " 筆。");
    } catch (error) {
      console.error("Failed to import holdings CSV", error);
      setFormError("持股 CSV 解析失敗，請確認格式與欄位。");
    }
  }

  async function requestImportHoldingsCsv(file: File) {
    setFormError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return setFormError("CSV 內容為空。");
      const totalRows = rows
        .slice(1)
        .filter((row) => row.some((cell) => cell.trim())).length;
      setConfirmState({ kind: "importHoldingsCsv", file, totalRows });
    } catch (error) {
      console.error("Failed to inspect holdings CSV", error);
      setFormError("持股 CSV 讀取失敗，請確認檔案格式。");
    }
  }

  function resetLocalDemoData() {
    const confirmed = window.confirm("確定要清除本機資料並重新載入 demo？此動作不會影響 Supabase。");
    if (!confirmed) return;
    if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSelectedPortfolioId("");
    seedDemoData();
    setMessage("已重置成本機 demo 資料。");
    setSheetMode(null);
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-ink/70">載入中...</main>;
  }

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h1 className="text-2xl font-bold">股票交易帳本</h1>
          <p className="mt-2 text-sm leading-6 text-ink/65">輸入 Email 取得登入連結。登入後資料會同步到 Supabase。</p>
          <input
            className="mt-5 w-full rounded-md border border-ink/15 bg-white px-3 py-3 outline-none focus:border-mint"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="mt-3 w-full rounded-md bg-mint px-4 py-3 font-semibold text-white" onClick={signIn}>
            寄送登入連結
          </button>
          {message && <p className="mt-3 text-sm text-ink/70">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-paper/90 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs font-semibold text-mint">Stock Ledger</p>
          <h1 className="text-lg font-bold">股票交易帳本</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-full p-2 text-ink/75 disabled:opacity-45"
            aria-label="更新現價"
            title="更新現價"
            onClick={() => void refreshQuotes()}
            disabled={quoteRefreshing}
          >
            <RefreshCw size={20} className={quoteRefreshing ? "animate-spin" : ""} />
          </button>
          <button className="rounded-full p-2 text-ink/75" aria-label="開啟設定" title="設定" onClick={() => setSheetMode("settings")}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {!hasSupabaseEnv && !demoBannerDismissed && (
        <section className="mx-4 mt-2 flex items-start justify-between gap-3 rounded-md border border-gold/30 bg-white px-3 py-2 text-xs text-ink/70 shadow-soft">
          <p>未設定 Supabase，現在顯示 demo 資料。填入 `.env.local` 後即可使用雲端同步。</p>
          <button className="shrink-0 text-ink/45" aria-label="關閉 demo 提示" onClick={dismissDemoBanner}>
            <X size={16} />
          </button>
        </section>
      )}

      {message && (
        <section className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-mint/20 bg-white px-3 py-2 text-sm text-ink/70 shadow-soft">
          <p>{message}</p>
          <button className="shrink-0 text-ink/45" aria-label="關閉訊息" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </section>
      )}

      {formError && !sheetMode && (
        <section className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-coral/20 bg-coral/10 px-3 py-2 text-sm text-coral shadow-soft">
          <p>{formError}</p>
          <button className="shrink-0 text-coral/70" aria-label="關閉錯誤訊息" onClick={() => setFormError("")}>
            <X size={16} />
          </button>
        </section>
      )}

      <section className="mt-4 px-4">
        {activeTab === "dashboard" && (
          <Dashboard
            metrics={metrics}
            positions={scopedPositions}
            trades={scopedTrades}
            stocks={stocks}
            portfolios={portfolios}
            selectedPortfolioId={activePortfolioId}
            onPortfolioChange={setSelectedPortfolioId}
            onEditTrade={openEditTrade}
          />
        )}
        {activeTab === "portfolios" && (
          <Portfolios
            portfolios={portfolios}
            cashMovements={cashMovements}
            selectedPortfolioId={activePortfolioId}
            onNew={openNewPortfolio}
            onCash={openCashForPortfolio}
            onRename={openRenamePortfolio}
            onDelete={requestDeletePortfolio}
            onSelectDefault={setSelectedPortfolioId}
          />
        )}
        {activeTab === "trades" && (
          <Trades
            trades={scopedTrades}
            stocks={stocks}
            portfolios={portfolios}
            importSummary={csvImportSummary}
            onEdit={openEditTrade}
            onDelete={requestDeleteTrade}
            onImportCsv={requestImportTradesCsv}
          />
        )}
        {activeTab === "holdings" && (
          <Holdings
            positions={scopedPositions}
            portfolios={portfolios}
            selectedPortfolioId={activePortfolioId}
            onPortfolioChange={setSelectedPortfolioId}
            onAdjustCost={openStockAdjustEditor}
            onImportCsv={requestImportHoldingsCsv}
          />
        )}
        {activeTab === "analytics" && (
          <Analytics
            positions={scopedPositions}
            trades={scopedTrades}
            stocks={stocks}
            portfolios={portfolios}
            selectedPortfolioId={activePortfolioId}
            onPortfolioChange={setSelectedPortfolioId}
            cash={metrics.cash}
          />
        )}
      </section>

      <button
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-soft"
        aria-label="開啟新增選單"
        title="新增"
        onClick={() => setSheetMode("actions")}
      >
        <Plus size={26} />
      </button>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {sheetMode && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/35" onClick={() => setSheetMode(null)}>
          <section className="mx-auto max-h-[86vh] w-full max-w-2xl overflow-auto rounded-t-xl bg-white p-4 shadow-soft" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{sheetMode === "trade" && editingTradeId ? "編輯交易" : sheetTitle(sheetMode)}</h2>
              <button className="rounded-full p-2" aria-label="關閉視窗" onClick={() => setSheetMode(null)}>
                <X size={20} />
              </button>
            </div>
            {formError && <p className="mb-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{formError}</p>}
            {sheetMode === "actions" && (
              <QuickActions
                onBuy={() => {
                  openNewTrade("buy");
                }}
                onSell={() => {
                  openNewTrade("sell");
                }}
              />
            )}
            {sheetMode === "trade" && (
              <TradeForm
                draft={tradeDraft}
                setDraft={setTradeDraft}
                portfolios={portfolios}
                positions={scopedPositions}
                stocks={stocks}
                settings={settings}
                stockCatalog={stockCatalog}
                onCash={() => setSheetMode("cash")}
                onSubmit={requestSaveTrade}
                submitLabel={editingTradeId ? "更新交易" : "儲存交易"}
              />
            )}
            {sheetMode === "portfolio" && (
              <PortfolioForm
                draft={portfolioDraft}
                setDraft={setPortfolioDraft}
                onSubmit={requestSavePortfolio}
                submitLabel={editingPortfolioId ? "儲存重新命名" : "新增帳本"}
                showInitialAmount={!editingPortfolioId}
              />
            )}
            {sheetMode === "cash" && <CashForm draft={cashDraft} setDraft={setCashDraft} portfolios={portfolios} onSubmit={requestCreateCashMovement} />}
            {sheetMode === "stockAdjust" && (
              <StockAdjustForm draft={stockDraft} baseline={stockAdjustBaseline} setDraft={setStockDraft} onSubmit={requestStockAdjustment} />
            )}
            {sheetMode === "settings" && (
              <SettingsForm
                settings={settings}
                setSettings={setSettings}
                dataSyncInfo={{
                  catalogSourceLabel,
                  latestQuoteLabel: formatQuoteUpdatedAt(latestQuoteAt),
                  autoRefreshLabel: "盤中自動更新"
                }}
                onSubmit={updateSettings}
                onExport={exportJsonBackup}
                onImport={importJsonBackup}
                onResetLocal={resetLocalDemoData}
                onReloadCatalog={() => void reloadStockCatalog()}
                onSignOut={hasSupabaseEnv ? () => void signOut() : undefined}
              />
            )}
          </section>
        </div>
      )}

      {confirmState?.kind === "deleteTrade" && (
        <ConfirmSheet
          title="刪除交易"
          body="刪除此交易後，帳本現金、持股與損益計算都會同步回復。"
          confirmLabel="確認刪除"
          tone="danger"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void deleteTrade(confirmState.trade).finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "updateTrade" && (
        <ConfirmSheet
          title="更新交易"
          body="確認後會覆寫這筆交易內容，並重新計算帳本現金、持股與損益。"
          confirmLabel="確認更新"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void saveTrade().finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "deletePortfolio" && (
        <ConfirmSheet
          title="刪除帳本"
          body={`刪除「${confirmState.portfolio.name}」後，相關交易、資金異動與成本校正都會一起移除，無法復原。`}
          confirmLabel="確認刪除"
          tone="danger"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void deletePortfolio(confirmState.portfolio).finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "renamePortfolio" && (
        <ConfirmSheet
          title="重新命名帳本"
          body="確認後會更新這個帳本名稱，原有交易、持股與資金異動都會沿用到新名稱。"
          confirmLabel="確認更新"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void savePortfolio().finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "cashMovement" && (
        <ConfirmSheet
          title="儲存資金異動"
          body="確認後會寫入這筆資金異動，並同步更新帳本現金餘額與累計投入 / 轉出。"
          confirmLabel="確認儲存"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void createCashMovement().finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "importCsv" && (
        <ConfirmSheet
          title="匯入 CSV"
          body={`檔案：${confirmState.file.name}。資料筆數：${confirmState.totalRows} 筆。確認後會開始匯入交易資料，並依目前費率重新計算手續費、交易稅與帳本現金。`}
          confirmLabel="確認匯入"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void importTradesCsv(confirmState.file).finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "importHoldingsCsv" && (
        <ConfirmSheet
          title="匯入持股 CSV"
          body={`檔案：${confirmState.file.name}。資料筆數：${confirmState.totalRows} 筆。確認後會更新目前持股庫存、持有成本、產業別與標籤；此操作不會新增交易紀錄。`}
          confirmLabel="確認匯入"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void importHoldingsCsv(confirmState.file).finally(() => setConfirmState(null))}
        />
      )}

      {confirmState?.kind === "importJson" && (
        <ConfirmSheet
          title="匯入 JSON 備份"
          body="匯入備份只會覆蓋本機 demo 畫面資料，不會同步到 Supabase。若要保留現在內容，請先匯出 JSON。"
          confirmLabel="確認匯入"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const snapshot = confirmState.snapshot;
            setUserId("demo");
            setSettings({ ...snapshot.settings, user_id: "demo" });
            setPortfolios(snapshot.portfolios.map(normalizePortfolio));
            setCashMovements(snapshot.cashMovements.map(normalizeCashMovement));
            setStocks(snapshot.stocks.map(normalizeStock));
            setStockTags(snapshot.stockTags);
            setPortfolioStockOverrides(snapshot.portfolioStockOverrides ?? []);
            setTrades(snapshot.trades.map(normalizeTrade));
            setPositionAdjustments((snapshot.positionAdjustments ?? []).map(normalizePositionAdjustment));
            setSelectedPortfolioId(snapshot.portfolios[0]?.id ?? "");
            setConfirmState(null);
            setMessage("備份已匯入。");
            setSheetMode(null);
          }}
        />
      )}

      {confirmState?.kind === "adjustCost" && (
        <ConfirmSheet
          title="確認校正成本"
          body="此操作不會新增交易，也不會影響券商原始成交紀錄。確認後只會覆寫這檔持股的顯示用股數與持有成本，並重新計算均價、預估損益與報酬率。"
          confirmLabel="確認校正"
          tone="primary"
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void updateStockAdjustment(confirmState.parsed)}
        />
      )}
    </main>
  );
}

function normalizePortfolio(row: Record<string, unknown>): Portfolio {
  return {
    ...(row as Portfolio),
    initial_amount: numberValue(row.initial_amount),
    cash_balance: numberValue(row.cash_balance),
    total_deposits: numberValue(row.total_deposits),
    total_withdrawals: numberValue(row.total_withdrawals)
  };
}

function normalizeStock(row: Record<string, unknown>): Stock {
  return { ...(row as Stock), current_price: numberValue(row.current_price) };
}

function normalizeTrade(row: Record<string, unknown>): Trade {
  return {
    ...(row as Trade),
    quantity: numberValue(row.quantity),
    unit_price: numberValue(row.unit_price),
    gross_amount: numberValue(row.gross_amount),
    fee: numberValue(row.fee),
    tax: numberValue(row.tax),
    net_amount: numberValue(row.net_amount)
  };
}

function normalizeCashMovement(row: Record<string, unknown>): CashMovement {
  return { ...(row as CashMovement), amount: numberValue(row.amount), balance_after: numberValue(row.balance_after) };
}

function normalizePositionAdjustment(row: Record<string, unknown>): PositionAdjustment {
  return {
    ...(row as PositionAdjustment),
    adjusted_quantity: numberValue(row.adjusted_quantity),
    adjusted_cost: numberValue(row.adjusted_cost),
    baseline_traded_at: typeof row.baseline_traded_at === "string" ? row.baseline_traded_at : null,
    baseline_created_at: typeof row.baseline_created_at === "string" ? row.baseline_created_at : null
  };
}

function normalizePortfolioStockOverride(row: Record<string, unknown>): PortfolioStockOverride {
  return {
    ...(row as PortfolioStockOverride),
    industry_override: typeof row.industry_override === "string" ? row.industry_override : null
  };
}

function normalizeSettings(row: Record<string, unknown>): UserSettings {
  const feeRate = numberValue(row.fee_rate);
  return {
    user_id: String(row.user_id),
    fee_rate: feeRate === 0.001425 ? DEFAULT_SETTINGS.fee_rate : feeRate,
    tax_rate: numberValue(row.tax_rate),
    minimum_fee: numberValue(row.minimum_fee),
    allow_negative_cash: Boolean(row.allow_negative_cash)
  };
}

function resolveIndustryValue(primary: string | null | undefined, fallback?: string | null) {
  const normalizedPrimary = primary?.trim();
  if (normalizedPrimary && normalizedPrimary !== "未分類") return normalizedPrimary;
  const normalizedFallback = fallback?.trim();
  return normalizedFallback || primary || null;
}

function hasResolvedIndustry(industry: string | null | undefined) {
  const normalized = industry?.trim();
  return Boolean(normalized && normalized !== "未分類");
}

function sheetTitle(mode: SheetMode) {
  const titles = {
    actions: "新增交易",
    trade: "新增交易",
    cash: "資金異動",
    portfolio: "帳本設定",
    stockAdjust: "校正成本",
    settings: "設定"
  };
  return mode ? titles[mode] : "";
}

function QuickActions({ onBuy, onSell }: { onBuy: () => void; onSell: () => void }) {
  const actions = [
    { label: "買入", icon: <TrendingUp size={20} />, onClick: onBuy, className: "bg-ink text-white" },
    { label: "賣出", icon: <TrendingDown size={20} />, onClick: onSell, className: "border-2 border-ink bg-white text-ink" }
  ];

  return (
    <div className="grid gap-3">
      {actions.map((action) => (
        <button
          key={action.label}
          className={"flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-left font-semibold " + action.className}
          onClick={action.onClick}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

function readLocalSnapshot(): LocalSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return normalizeLocalSnapshot(JSON.parse(raw) as Partial<LocalSnapshot>);
  } catch (error) {
    console.error("Failed to read local snapshot", error);
    return null;
  }
}

function normalizeLocalSnapshot(parsed: Partial<LocalSnapshot>): LocalSnapshot | null {
  if (parsed.version !== 1 || !Array.isArray(parsed.portfolios) || !Array.isArray(parsed.trades)) return null;

  return {
    version: 1,
    portfolios: parsed.portfolios ?? [],
    cashMovements: parsed.cashMovements ?? [],
    stocks: parsed.stocks ?? [],
    stockTags: parsed.stockTags ?? [],
    portfolioStockOverrides: Array.isArray(parsed.portfolioStockOverrides)
      ? parsed.portfolioStockOverrides.map((row) => normalizePortfolioStockOverride(row as Record<string, unknown>))
      : [],
    trades: parsed.trades ?? [],
    positionAdjustments: Array.isArray(parsed.positionAdjustments) ? parsed.positionAdjustments.map((row) => normalizePositionAdjustment(row as Record<string, unknown>)) : [],
    settings: parsed.settings ? normalizeSettings(parsed.settings as unknown as Record<string, unknown>) : DEFAULT_SETTINGS
  };
}

function saveLocalSnapshot(snapshot: LocalSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error("Failed to save local snapshot", error);
  }
}

function BottomNav({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "dashboard", label: "總覽", icon: <Home size={20} /> },
    { id: "portfolios", label: "帳本", icon: <BookOpen size={20} /> },
    { id: "trades", label: "交易", icon: <ReceiptText size={20} /> },
    { id: "holdings", label: "持股", icon: <BriefcaseBusiness size={20} /> },
    { id: "analytics", label: "分析", icon: <ChartPie size={20} /> }
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map((item) => (
          <button
            key={item.id}
            className={"flex min-h-16 flex-col items-center justify-center gap-1 text-xs " + (activeTab === item.id ? "text-mint" : "text-ink/55")}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function movementTypeLabel(type: CashMovementType) {
  if (type === "deposit") return "加入金額";
  if (type === "withdraw") return "轉出金額";
  return "金額修正";
}




