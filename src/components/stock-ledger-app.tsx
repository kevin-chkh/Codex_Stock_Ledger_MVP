"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  ChartPie,
  Home,
  LogOut,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
  X
} from "lucide-react";
import { z } from "zod";
import { calculateDashboardMetrics, calculateTradeAmounts, DEFAULT_SETTINGS, buildPositions } from "@/lib/calculations";
import { parseCsv } from "@/lib/csv";
import { currency, parseTags, profitClass } from "@/lib/format";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import { loadStockCatalog, type StockCatalogItem } from "@/lib/stock-lookup";
import { buildPortfolioUpdates, deleteTradeFromPortfolios, hasOversoldPosition, makeTrade, tradeCashImpact } from "@/lib/trade-ledger";
import type { CashMovement, CashMovementType, Portfolio, Position, Stock, StockTag, Trade, TradeType, UserSettings } from "@/lib/types";
import { Dashboard } from "@/components/stock-ledger/dashboard";
import { ListSection, Row } from "@/components/stock-ledger/ui";
import { Trades } from "@/components/stock-ledger/trades";
import { Holdings } from "@/components/stock-ledger/holdings";
import { Analytics } from "@/components/stock-ledger/analytics";
import { CashForm, PortfolioForm, SettingsForm, StockForm, TradeForm } from "@/components/stock-ledger/forms";
import { Portfolios } from "@/components/stock-ledger/portfolios";

type Tab = "dashboard" | "portfolios" | "trades" | "holdings" | "analytics";
type SheetMode = "actions" | "trade" | "cash" | "portfolio" | "stock" | "settings" | null;
type TradeDraft = {
  portfolioId: string;
  type: TradeType;
  symbol: string;
  name: string;
  quantity: string;
  unitPrice: string;
  industry: string;
  tags: string;
};
type PortfolioDraft = { name: string; initialAmount: string; note: string };
type CashDraft = { portfolioId: string; type: CashMovementType; amount: string; note: string };
type StockDraft = { stockId: string; currentPrice: string; industry: string; tags: string };
type LocalSnapshot = {
  version: 1;
  portfolios: Portfolio[];
  cashMovements: CashMovement[];
  stocks: Stock[];
  stockTags: StockTag[];
  trades: Trade[];
  settings: UserSettings;
};

type QuotePayload = {
  quotes: { symbol: string; market: string; price: number; priceUpdatedAt: string }[];
  failedSymbols: string[];
};

const LOCAL_STORAGE_KEY = "stock-ledger-local-v1";

const tradeSchema = z.object({
  portfolioId: z.string().min(1, "請選擇帳本"),
  type: z.enum(["buy", "sell"]),
  symbol: z.string().min(1, "請輸入股票代號").max(20),
  name: z.string().min(1, "請輸入股票名稱").max(80),
  quantity: z.coerce.number().positive("股數需大於 0"),
  unitPrice: z.coerce.number().positive("成交單價(股)需大於 0"),
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
  currentPrice: z.coerce.number().min(0, "價格不可小於 0"),
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

const emptyTradeDraft: TradeDraft = {
  portfolioId: "",
  type: "buy",
  symbol: "",
  name: "",
  quantity: "",
  unitPrice: "",
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [stockCatalog, setStockCatalog] = useState<StockCatalogItem[]>([]);
  const [catalogSource, setCatalogSource] = useState<"api" | "cache" | "fallback">("fallback");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [dashboardPortfolioId, setDashboardPortfolioId] = useState("all");
  const [tradeDraft, setTradeDraft] = useState<TradeDraft>(emptyTradeDraft);
  const [portfolioDraft, setPortfolioDraft] = useState({ name: "", initialAmount: "", note: "" });
  const [cashDraft, setCashDraft] = useState({ portfolioId: "", type: "deposit" as CashMovementType, amount: "", note: "" });
  const [stockDraft, setStockDraft] = useState({ stockId: "", currentPrice: "", industry: "", tags: "" });

  const positions = useMemo(() => buildPositions(trades, stocks, stockTags), [trades, stocks, stockTags]);
  const catalogBySymbol = useMemo(() => new Map(stockCatalog.map((item) => [item.symbol, item])), [stockCatalog]);
  const stockSignature = useMemo(() => stocks.map((stock) => stock.id).sort().join("|"), [stocks]);
  const latestQuoteAt = useMemo(() => {
    const timestamps = stocks.map((stock) => stock.price_updated_at).filter((value): value is string => Boolean(value));
    if (!timestamps.length) return null;
    return timestamps.reduce((latest, current) => (new Date(current).getTime() > new Date(latest).getTime() ? current : latest));
  }, [stocks]);
  const dashboardPortfolios = useMemo(
    () => (dashboardPortfolioId === "all" ? portfolios : portfolios.filter((portfolio) => portfolio.id === dashboardPortfolioId)),
    [dashboardPortfolioId, portfolios]
  );
  const dashboardPositions = useMemo(
    () => (dashboardPortfolioId === "all" ? positions : positions.filter((position) => position.portfolio_id === dashboardPortfolioId)),
    [dashboardPortfolioId, positions]
  );
  const dashboardTrades = useMemo(
    () => (dashboardPortfolioId === "all" ? trades : trades.filter((trade) => trade.portfolio_id === dashboardPortfolioId)),
    [dashboardPortfolioId, trades]
  );
  const metrics = useMemo(() => calculateDashboardMetrics(dashboardPortfolios, dashboardPositions), [dashboardPortfolios, dashboardPositions]);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (loading || hasSupabaseEnv || userId !== "demo") return;
    saveLocalSnapshot({
      version: 1,
      portfolios,
      cashMovements,
      stocks,
      stockTags,
      trades,
      settings
    });
  }, [cashMovements, loading, portfolios, settings, stockTags, stocks, trades, userId]);

  useEffect(() => {
    if (!userId || !stockSignature) return;

    let cancelled = false;
    const run = async () => {
      if (cancelled || typeof document !== "undefined" && document.visibilityState !== "visible") return;
      await refreshQuotes(false);
    };

    void run();
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

  async function refreshQuotes(showResultMessage = true) {
    if (!stocks.length) {
      if (showResultMessage) setMessage("尚無股票可更新現價。");
      return;
    }

    setQuoteRefreshing(true);
    try {
      const response = await fetch("/api/stock-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: stocks.map((stock) => ({
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

      const nextStocks = stocks.map((stock) => {
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
        const updates = nextStocks.filter(
          (stock, index) =>
            stock.current_price !== stocks[index]?.current_price ||
            stock.price_updated_at !== stocks[index]?.price_updated_at ||
            stock.market !== stocks[index]?.market
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

      if (updatedCount) setStocks(nextStocks);

      if (showResultMessage) {
        if (!updatedCount) {
          setMessage("目前查無可更新的盤中報價。");
        } else {
          const failed = payload.failedSymbols?.length ? `，${payload.failedSymbols.length} 檔暫時查無盤中報價` : "";
          setMessage(`現價已更新 ${updatedCount} 檔${failed}。`);
        }
      }
    } catch (error) {
      console.error("Failed to refresh quotes", error);
      if (showResultMessage) setMessage("更新現價失敗，請稍後再試。");
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
    setTrades(snapshot.trades.map(normalizeTrade));
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
    setPortfolios([
      {
        id: portfolioId,
        user_id: demoUser,
        name: "台股主帳本",
        currency: "TWD",
        initial_amount: 300000,
        cash_balance: 135544,
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
    const [portfolioResult, stockResult, tagResult, tradeResult, cashResult, settingsResult] = await Promise.all([
      supabase.from("portfolios").select("*").order("created_at", { ascending: true }),
      supabase.from("stocks").select("*").order("symbol", { ascending: true }),
      supabase.from("stock_tags").select("*").order("name", { ascending: true }),
      supabase.from("trades").select("*, stock:stocks(*)").order("traded_at", { ascending: false }),
      supabase.from("cash_movements").select("*").order("occurred_at", { ascending: false }),
      supabase.from("settings").select("*").eq("user_id", uidValue).maybeSingle()
    ]);

    setPortfolios((portfolioResult.data ?? []).map(normalizePortfolio));
    setStocks((stockResult.data ?? []).map(normalizeStock));
    setStockTags((tagResult.data ?? []) as StockTag[]);
    setTrades((tradeResult.data ?? []).map(normalizeTrade));
    setCashMovements((cashResult.data ?? []).map(normalizeCashMovement));
    setSettings(settingsResult.data ? normalizeSettings(settingsResult.data) : { ...DEFAULT_SETTINGS, user_id: uidValue });
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

  async function createPortfolio() {
    setFormError("");
    const parsed = portfolioSchema.safeParse(portfolioDraft);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    const id = uid();
    const now = new Date().toISOString();
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
    setPortfolioDraft({ name: "", initialAmount: "", note: "" });
    setMessage("帳本已新增。");
    setSheetMode(null);
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
      const { error: updateError } = await supabase.from("portfolios").update(nextPortfolio).eq("id", portfolio.id);
      if (updateError) return setFormError(toUserError(updateError, "更新帳本失敗。"));
      const { error: insertError } = await supabase.from("cash_movements").insert(movement);
      if (insertError) return setFormError(toUserError(insertError, "建立資金異動失敗。"));
    }

    setPortfolios((current) => current.map((item) => (item.id === portfolio.id ? nextPortfolio : item)));
    setCashMovements((current) => [movement, ...current]);
    setCashDraft({ portfolioId: portfolio.id, type: "deposit", amount: "", note: "" });
    setMessage("資金異動已儲存。");
    setSheetMode(null);
  }

  async function saveTrade() {
    setFormError("");
    const parsed = tradeSchema.safeParse({ ...tradeDraft, portfolioId: tradeDraft.portfolioId || portfolios[0]?.id || "" });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    const portfolio = portfolios.find((item) => item.id === parsed.data.portfolioId);
    if (!portfolio) return setFormError("找不到帳本");
    const editingTrade = editingTradeId ? (trades.find((trade) => trade.id === editingTradeId) ?? null) : null;

    const catalogStock = catalogBySymbol.get(parsed.data.symbol);
    const existingStock = stocks.find((item) => item.symbol === parsed.data.symbol);
    const stock: Stock =
      existingStock
        ? {
            ...existingStock,
            name: parsed.data.name,
            market: catalogStock?.market || existingStock.market,
            industry: parsed.data.industry || existingStock.industry,
            updated_at: new Date().toISOString()
          }
        :
      ({
        id: uid(),
        user_id: userId ?? "demo",
        symbol: parsed.data.symbol,
        name: parsed.data.name,
        market: catalogStock?.market || "TWSE",
        industry: parsed.data.industry || null,
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

    if (parsed.data.type === "sell") {
      const tradesForValidation = editingTradeId ? trades.filter((trade) => trade.id !== editingTradeId) : trades;
      const validationPositions = buildPositions(tradesForValidation, existingStock ? stocks : [...stocks, stock], stockTags);
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
      tradedAt: today(),
      createdAt: new Date().toISOString(),
      note: null
    });
    const trade: Trade = editingTrade
      ? { ...tradeBase, id: editingTrade.id, traded_at: editingTrade.traded_at, created_at: editingTrade.created_at }
      : tradeBase;
    const nextTrades = editingTrade ? trades.map((item) => (item.id === trade.id ? trade : item)) : [trade, ...trades];
    const shouldValidateOversold =
      parsed.data.type === "sell" ||
      Boolean(editingTrade && (editingTrade.type === "sell" || editingTrade.quantity > parsed.data.quantity || editingTrade.stock_id !== stock.id || editingTrade.portfolio_id !== portfolio.id));
    if (shouldValidateOversold && hasOversoldPosition(nextTrades, { portfolioId: portfolio.id, stockId: stock.id })) {
      return setFormError("此修改會造成某檔股票賣出股數超過持有股數，請先調整相關交易。");
    }
    const tagRows = parseTags(parsed.data.tags).map((name) => ({
      id: uid(),
      user_id: userId ?? "demo",
      stock_id: stock.id,
      name
    }));
    const portfolioUpdates = buildPortfolioUpdates(portfolios, editingTrade, trade, new Date().toISOString());

    if (supabase && hasSupabaseEnv) {
      if (!existingStock) {
        const { error: stockError } = await supabase.from("stocks").insert(stock);
        if (stockError) return setFormError(toUserError(stockError, "建立股票失敗。"));
      } else if (parsed.data.industry && parsed.data.industry !== existingStock.industry) {
        await supabase.from("stocks").update({ industry: parsed.data.industry, updated_at: new Date().toISOString() }).eq("id", stock.id);
      }
      const { error: tradeError } = editingTrade
        ? await supabase.from("trades").update(trade).eq("id", trade.id)
        : await supabase.from("trades").insert(trade);
      if (tradeError) return setFormError(toUserError(tradeError, "儲存交易失敗。"));
      await supabase.from("stock_tags").delete().eq("stock_id", stock.id);
      if (tagRows.length) {
        const { error: tagError } = await supabase.from("stock_tags").insert(tagRows);
        if (tagError) return setFormError(toUserError(tagError, "儲存標籤失敗。"));
      }
      for (const nextPortfolio of portfolioUpdates) {
        const { error: portfolioError } = await supabase
          .from("portfolios")
          .update({ cash_balance: nextPortfolio.cash_balance, updated_at: nextPortfolio.updated_at })
          .eq("id", nextPortfolio.id);
        if (portfolioError) return setFormError(toUserError(portfolioError, "更新帳本現金失敗。"));
      }
    }

    setStocks((current) => (existingStock ? current.map((item) => (item.id === stock.id ? stock : item)) : [...current, stock]));
    setStockTags((current) => [...current.filter((item) => item.stock_id !== stock.id), ...tagRows]);
    setTrades(nextTrades);
    setPortfolios((current) =>
      current.map((item) => portfolioUpdates.find((nextPortfolio) => nextPortfolio.id === item.id) ?? item)
    );
    setEditingTradeId(null);
    setTradeDraft({ ...emptyTradeDraft, portfolioId: portfolio.id });
    setFormError("");
    setMessage("儲存成功");
    setSheetMode(null);
  }

  async function deleteTrade(trade: Trade) {
    const confirmed = window.confirm("確定要刪除這筆交易？帳本現金會同步回復。");
    if (!confirmed) return;
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
      const { error: tradeError } = await supabase.from("trades").delete().eq("id", trade.id);
      if (tradeError) {
        const error = toUserError(tradeError, "刪除交易失敗。");
        setMessage(error);
        return setFormError(error);
      }
      const { error: portfolioError } = await supabase
        .from("portfolios")
        .update({ cash_balance: nextPortfolio.cash_balance, updated_at: nextPortfolio.updated_at })
        .eq("id", nextPortfolio.id);
      if (portfolioError) {
        const error = toUserError(portfolioError, "更新帳本現金失敗。");
        setMessage(error);
        return setFormError(error);
      }
    }

    setTrades(nextTrades);
    setPortfolios((current) => current.map((item) => (item.id === nextPortfolio.id ? nextPortfolio : item)));
    setFormError("");
    setMessage("交易已刪除。");
  }

  function openEditTrade(trade: Trade) {
    const stock = stocks.find((item) => item.id === trade.stock_id);
    setEditingTradeId(trade.id);
    setTradeDraft({
      portfolioId: trade.portfolio_id,
      type: trade.type,
      symbol: stock?.symbol ?? "",
      name: stock?.name ?? "",
      quantity: String(trade.quantity),
      unitPrice: String(trade.unit_price),
      industry: stock?.industry ?? "",
      tags: stockTags
        .filter((tag) => tag.stock_id === trade.stock_id)
        .map((tag) => tag.name)
        .join(", ")
    });
    setSheetMode("trade");
  }

  function openNewTrade(type: TradeType) {
    setEditingTradeId(null);
    setTradeDraft((value) => ({ ...emptyTradeDraft, portfolioId: value.portfolioId || portfolios[0]?.id || "", type }));
    setSheetMode("trade");
  }

  async function updateStock() {
    setFormError("");
    const parsed = stockSchema.safeParse(stockDraft);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "資料格式錯誤");
    const stock = stocks.find((item) => item.id === parsed.data.stockId);
    if (!stock) return setFormError("找不到股票");

    const nextStock = {
      ...stock,
      current_price: parsed.data.currentPrice,
      industry: parsed.data.industry || null,
      price_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const nextTags = (parsed.data.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((name) => ({ id: uid(), user_id: userId ?? "demo", stock_id: stock.id, name }));

    if (supabase && hasSupabaseEnv) {
      const { error: stockError } = await supabase.from("stocks").update(nextStock).eq("id", stock.id);
      if (stockError) return setFormError(toUserError(stockError, "更新股票失敗。"));
      await supabase.from("stock_tags").delete().eq("stock_id", stock.id);
      if (nextTags.length) {
        const { error: tagError } = await supabase.from("stock_tags").insert(nextTags);
        if (tagError) return setFormError(toUserError(tagError, "更新標籤失敗。"));
      }
    }

    setStocks((current) => current.map((item) => (item.id === stock.id ? nextStock : item)));
    setStockTags((current) => [...current.filter((item) => item.stock_id !== stock.id), ...nextTags]);
    setMessage("股票資訊已更新。");
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
      trades,
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
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { data?: unknown };
      const snapshot = normalizeLocalSnapshot((parsed.data ?? parsed) as Partial<LocalSnapshot>);
      if (!snapshot) return setFormError("備份檔格式不正確，請選擇 Stock Ledger JSON 備份檔。");
      const confirmed = window.confirm("匯入備份會覆蓋目前本機畫面資料，確定繼續？");
      if (!confirmed) return;

      setUserId("demo");
      setSettings({ ...snapshot.settings, user_id: "demo" });
      setPortfolios(snapshot.portfolios.map(normalizePortfolio));
      setCashMovements(snapshot.cashMovements.map(normalizeCashMovement));
      setStocks(snapshot.stocks.map(normalizeStock));
      setStockTags(snapshot.stockTags);
      setTrades(snapshot.trades.map(normalizeTrade));
      setDashboardPortfolioId("all");
      setMessage("備份已匯入。");
      setSheetMode(null);
    } catch (error) {
      console.error("Failed to import backup", error);
      setFormError("備份檔讀取失敗，請確認檔案是有效 JSON。");
    }
  }

  async function importTradesCsv(file: File) {
    setFormError("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) return setFormError("CSV 內容為空。");

      const header = rows[0].map((value) => value.trim());
      const required = ["日期", "帳本", "買賣", "股票代號", "股票名稱", "股數", "成交單價"];
      const missing = required.filter((field) => !header.includes(field));
      if (missing.length) return setFormError("CSV 欄位缺少：" + missing.join("、"));

      const headerIndex = new Map(header.map((name, index) => [name, index]));
      const parsedRows = rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => ({
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

      for (const row of parsedRows) {
        if (!row.portfolioName || !row.symbol || !row.name || !Number.isFinite(row.quantity) || !Number.isFinite(row.unitPrice) || row.quantity <= 0 || row.unitPrice <= 0) {
          continue;
        }
        const portfolio = nextPortfolios.find((item) => item.name === row.portfolioName);
        if (!portfolio) continue;
        const tradeType: TradeType = row.type.includes("賣") ? "sell" : "buy";

        let stock = nextStocks.find((item) => item.symbol === row.symbol);
        const catalogMatch = catalogBySymbol.get(row.symbol);
        if (!stock) {
          stock = {
            id: uid(),
            user_id: userId ?? "demo",
            symbol: row.symbol,
            name: row.name,
            market: catalogMatch?.market || "TWSE",
            industry: row.industry || null,
            current_price: row.unitPrice,
            price_updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          nextStocks.push(stock);
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
        if (hasOversoldPosition(candidateTrades, { portfolioId: portfolio.id, stockId: stock.id })) continue;
        if (tradeType === "buy" && !settings.allow_negative_cash) {
          const currentPortfolio = nextPortfolios.find((item) => item.id === portfolio.id);
          if (!currentPortfolio || currentPortfolio.cash_balance < trade.net_amount) continue;
        }

        nextTrades = candidateTrades;
        nextPortfolios = nextPortfolios.map((item) =>
          item.id === portfolio.id ? { ...item, cash_balance: item.cash_balance + tradeCashImpact(trade), updated_at: createdAt } : item
        );
      }

      if (supabase && hasSupabaseEnv) {
        const client = supabase;
        await Promise.all(nextStocks.filter((stock) => !stocks.some((old) => old.id === stock.id)).map((stock) => client.from("stocks").insert(stock)));
        await client.from("trades").insert(nextTrades.filter((trade) => !trades.some((old) => old.id === trade.id)));
        for (const portfolio of nextPortfolios) {
          const old = portfolios.find((item) => item.id === portfolio.id);
          if (old && old.cash_balance !== portfolio.cash_balance) {
            await client.from("portfolios").update({ cash_balance: portfolio.cash_balance, updated_at: portfolio.updated_at }).eq("id", portfolio.id);
          }
        }
      }

      setStocks(nextStocks);
      setTrades(nextTrades);
      setPortfolios(nextPortfolios);
      setMessage("CSV 匯入完成，新增交易 " + (nextTrades.length - trades.length) + " 筆。");
    } catch (error) {
      console.error("Failed to import CSV", error);
      setFormError("CSV 解析失敗，請確認格式與欄位。");
    }
  }

  function resetLocalDemoData() {
    const confirmed = window.confirm("確定要清除本機資料並重新載入 demo？此動作不會影響 Supabase。");
    if (!confirmed) return;
    if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    setDashboardPortfolioId("all");
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
    <main className="mx-auto min-h-screen w-full max-w-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-paper/90 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs font-semibold text-mint">Stock Ledger</p>
          <h1 className="text-lg font-bold">股票交易帳本</h1>
          <p className="mt-1 text-xs text-ink/60">
            資料來源：
            {catalogSource === "api" ? "API" : catalogSource === "cache" ? "本地快取" : "fallback"}
          </p>
          <p className="mt-1 text-xs text-ink/45">現價更新：{formatQuoteUpdatedAt(latestQuoteAt)} · 90 秒自動更新</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="rounded-full p-2 text-ink/75 disabled:opacity-45"
            title="更新近即時股價"
            onClick={() => void refreshQuotes()}
            disabled={quoteRefreshing}
          >
            <RefreshCw size={20} className={quoteRefreshing ? "animate-spin" : ""} />
          </button>
          <button className="rounded-full p-2 text-ink/75 disabled:opacity-45" title="重新載入股票目錄" onClick={() => void reloadStockCatalog()} disabled={catalogLoading}>
            <BookOpen size={20} className={catalogLoading ? "animate-pulse" : ""} />
          </button>
          <button className="rounded-full p-2 text-ink/75" title="設定" onClick={() => setSheetMode("settings")}>
            <Settings size={20} />
          </button>
          {hasSupabaseEnv && (
            <button className="rounded-full p-2 text-ink/75" title="登出" onClick={signOut}>
              <LogOut size={20} />
            </button>
          )}
        </div>
      </header>

      {message && (
        <section className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-mint/20 bg-white px-3 py-2 text-sm text-ink/70 shadow-soft">
          <p>{message}</p>
          <button className="shrink-0 text-ink/45" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </section>
      )}

      {formError && !sheetMode && (
        <section className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-coral/20 bg-coral/10 px-3 py-2 text-sm text-coral shadow-soft">
          <p>{formError}</p>
          <button className="shrink-0 text-coral/70" onClick={() => setFormError("")}>
            <X size={16} />
          </button>
        </section>
      )}

      <section className="mt-4 px-4">
        {activeTab === "dashboard" && (
          <Dashboard
            metrics={metrics}
            positions={dashboardPositions}
            trades={dashboardTrades}
            stocks={stocks}
            portfolios={portfolios}
            selectedPortfolioId={dashboardPortfolioId}
            onPortfolioChange={setDashboardPortfolioId}
          />
        )}
        {activeTab === "portfolios" && (
          <Portfolios portfolios={portfolios} cashMovements={cashMovements} onNew={() => setSheetMode("portfolio")} onCash={() => setSheetMode("cash")} />
        )}
        {activeTab === "trades" && <Trades trades={trades} stocks={stocks} portfolios={portfolios} onEdit={openEditTrade} onDelete={deleteTrade} onImportCsv={importTradesCsv} />}
        {activeTab === "holdings" && (
          <Holdings
            positions={positions}
            onEdit={(position) => {
              setStockDraft({
                stockId: position.stock_id,
                currentPrice: String(position.current_price),
                industry: position.industry === "未分類" ? "" : position.industry,
                tags: position.tags.join(", ")
              });
              setSheetMode("stock");
            }}
          />
        )}
        {activeTab === "analytics" && <Analytics positions={positions} />}
      </section>

      <button
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-soft"
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
              <button className="rounded-full p-2" onClick={() => setSheetMode(null)}>
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
                onCash={() => setSheetMode("cash")}
              />
            )}
            {sheetMode === "trade" && (
              <TradeForm
                draft={tradeDraft}
                setDraft={setTradeDraft}
                portfolios={portfolios}
                positions={positions}
                stocks={stocks}
                settings={settings}
                stockCatalog={stockCatalog}
                onCash={() => setSheetMode("cash")}
                onSubmit={saveTrade}
                submitLabel={editingTradeId ? "更新交易" : "儲存交易"}
              />
            )}
            {sheetMode === "portfolio" && <PortfolioForm draft={portfolioDraft} setDraft={setPortfolioDraft} onSubmit={createPortfolio} />}
            {sheetMode === "cash" && <CashForm draft={cashDraft} setDraft={setCashDraft} portfolios={portfolios} onSubmit={createCashMovement} />}
            {sheetMode === "stock" && <StockForm draft={stockDraft} setDraft={setStockDraft} onSubmit={updateStock} />}
            {sheetMode === "settings" && (
              <SettingsForm
                settings={settings}
                setSettings={setSettings}
                onSubmit={updateSettings}
                onExport={exportJsonBackup}
                onImport={importJsonBackup}
                onResetLocal={resetLocalDemoData}
              />
            )}
          </section>
        </div>
      )}

      {!hasSupabaseEnv && (
        <div className="fixed left-3 right-3 top-16 z-20 mx-auto max-w-md rounded-md border border-gold/30 bg-white px-3 py-2 text-xs text-ink/70 shadow-soft">
          未設定 Supabase，現在顯示 demo 資料。填入 `.env.local` 後即可使用雲端同步。        </div>
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

function normalizeSettings(row: Record<string, unknown>): UserSettings {
  return {
    user_id: String(row.user_id),
    fee_rate: numberValue(row.fee_rate),
    tax_rate: numberValue(row.tax_rate),
    minimum_fee: numberValue(row.minimum_fee),
    allow_negative_cash: Boolean(row.allow_negative_cash)
  };
}

function sheetTitle(mode: SheetMode) {
  const titles = {
    actions: "新增",
    trade: "新增交易",
    cash: "資金異動",
    portfolio: "新增帳本",
    stock: "更新股票資訊",
    settings: "設定"
  };
  return mode ? titles[mode] : "";
}

function QuickActions({ onBuy, onSell, onCash }: { onBuy: () => void; onSell: () => void; onCash: () => void }) {
  const actions = [
    { label: "買入", icon: <TrendingUp size={20} />, onClick: onBuy, className: "bg-coral text-white" },
    { label: "賣出", icon: <TrendingDown size={20} />, onClick: onSell, className: "bg-mint text-white" },
    { label: "資金異動", icon: <Wallet size={20} />, onClick: onCash, className: "bg-ink text-white" }
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
    trades: parsed.trades ?? [],
    settings: parsed.settings ?? DEFAULT_SETTINGS
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




