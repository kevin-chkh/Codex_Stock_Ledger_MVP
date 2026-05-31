import { Download, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateTradeAmounts, resolveUnitPriceFromTotalAmount } from "@/lib/calculations";
import { currency, decimal, profitClass } from "@/lib/format";
import { findStockByName, findStockBySymbol, fuzzySearchStocks, type StockCatalogItem } from "@/lib/stock-lookup";
import type { CashMovementType, Portfolio, Position, Stock, TradeType, UserSettings } from "@/lib/types";
import { Field, Segmented, Select, SubmitButton } from "./ui";

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
  industry: string;
  tags: string;
};

type PortfolioDraft = { name: string; initialAmount: string; note: string };
type CashDraft = { portfolioId: string; type: CashMovementType; amount: string; note: string };
type StockDraft = { stockId: string; portfolioId: string; currentPrice: string; quantity: string; holdingCost: string; industry: string; tags: string };
type StockAdjustBaseline = { quantity: number; holdingCost: number };

function stripNumberFormatting(value: string) {
  return value.replace(/,/g, "").trim();
}

function formatThousandsInput(value: string) {
  const normalized = stripNumberFormatting(value);
  if (!normalized) return "";
  const [integerPart, decimalPart] = normalized.split(".");
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

function StockSuggestionMenu({ items, onPick }: { items: StockCatalogItem[]; onPick: (item: StockCatalogItem) => void }) {
  return (
    <div className="absolute left-0 right-0 top-[84px] z-20 overflow-hidden rounded-md border border-ink/15 bg-white shadow-soft">
      {items.map((item) => (
        <button
          key={item.symbol}
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper"
          onClick={() => onPick(item)}
        >
          <span className="font-semibold">{item.symbol}</span>
          <span className="ml-3 min-w-0 flex-1 truncate text-ink/70">{item.name}</span>
          <span className="ml-2 shrink-0 text-xs text-ink/45">{item.industry}</span>
        </button>
      ))}
    </div>
  );
}

export function TradeForm({
  draft,
  setDraft,
  portfolios,
  positions,
  stocks,
  settings,
  stockCatalog,
  onCash,
  onSubmit,
  submitLabel
}: {
  draft: TradeDraft;
  setDraft: (value: TradeDraft | ((value: TradeDraft) => TradeDraft)) => void;
  portfolios: Portfolio[];
  positions: Position[];
  stocks: Stock[];
  settings: UserSettings;
  stockCatalog: StockCatalogItem[];
  onCash: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const symbolSuggestions = useMemo(() => fuzzySearchStocks(stockCatalog, draft.symbol, 8), [stockCatalog, draft.symbol]);
  const nameSuggestions = useMemo(() => fuzzySearchStocks(stockCatalog, draft.name, 8), [stockCatalog, draft.name]);
  const selectedPortfolioId = draft.portfolioId || portfolios[0]?.id || "";
  const selectedStock = useMemo(() => stocks.find((stock) => stock.symbol === draft.symbol), [stocks, draft.symbol]);
  const selectedPosition = useMemo(
    () => positions.find((position) => position.stock_id === selectedStock?.id && position.portfolio_id === selectedPortfolioId),
    [positions, selectedPortfolioId, selectedStock?.id]
  );

  const autoFillBySymbol = (symbol: string) => {
    const found = findStockBySymbol(stockCatalog, symbol);
    setDraft((value) => ({
      ...value,
      symbol,
      name: found?.name || value.name,
      industry: found?.industry || value.industry
    }));
  };
  const clearSelectedStock = () => {
    setDraft((value) => ({
      ...value,
      symbol: "",
      name: "",
      industry: ""
    }));
    setShowSymbolSuggestions(false);
    setShowNameSuggestions(false);
  };
  const pickSymbolSuggestion = (item: StockCatalogItem) => {
    setDraft((value) => ({
      ...value,
      symbol: item.symbol,
      name: item.name,
      industry: item.industry || value.industry
    }));
    setShowSymbolSuggestions(false);
    setShowNameSuggestions(false);
  };
  const autoFillByName = (name: string) => {
    const found = findStockByName(stockCatalog, name);
    setDraft((value) => ({
      ...value,
      name,
      symbol: found?.symbol || value.symbol,
      industry: found?.industry || value.industry
    }));
  };
  const resolvedUnitPrice =
    draft.buyMode === "totalAmount"
      ? Number(draft.quantity || 0) > 0
        ? resolveUnitPriceFromTotalAmount({
            type: draft.type,
            quantity: Number(draft.quantity || 0),
            totalAmount: Number(stripNumberFormatting(draft.totalAmount || "0")),
            settings
          })
        : 0
      : Number(draft.unitPrice || 0);
  const preview = calculateTradeAmounts({
    type: draft.type,
    quantity: Number(draft.quantity || 0),
    unitPrice: resolvedUnitPrice,
    settings
  });
  const estimatedRealizedProfit =
    draft.type === "sell" && selectedPosition
      ? preview.netAmount - selectedPosition.average_cost * Number(draft.quantity || 0)
      : null;

  return (
    <div className="space-y-3">
      {!portfolios.length && (
        <button className="w-full rounded-md border border-mint px-3 py-3 text-mint" onClick={onCash}>
          尚無帳本，請先新增帳本或資金
        </button>
      )}
      <Segmented
        value={draft.type}
        onChange={(type) =>
          setDraft((value) => ({
            ...value,
            type: type as TradeType
          }))
        }
        options={[["buy", "買入"], ["sell", "賣出"]]}
      />
      <Segmented
        value={draft.buyMode}
        onChange={(buyMode) => setDraft((value) => ({ ...value, buyMode: buyMode as "unitPrice" | "totalAmount" }))}
        options={[
          ["unitPrice", "輸入單價"],
          ["totalAmount", "輸入總額"]
        ]}
      />
      <Select value={selectedPortfolioId} onChange={(portfolioId) => setDraft((value) => ({ ...value, portfolioId }))} options={portfolios.map((item) => [item.id, item.name])} />
      <Field label="成交日期" type="date" value={draft.tradedAt} onChange={(tradedAt) => setDraft((value) => ({ ...value, tradedAt }))} />
      <div className="relative">
        <Field
          label="股票代號"
          value={draft.symbol}
          onChange={(symbol) => {
            autoFillBySymbol(symbol);
            setShowSymbolSuggestions(Boolean(symbol.trim()));
          }}
          placeholder="2330"
        />
        {showSymbolSuggestions && symbolSuggestions.length > 0 && (
          <StockSuggestionMenu items={symbolSuggestions} onPick={pickSymbolSuggestion} />
        )}
      </div>
      <div className="relative">
        <Field
          label="股票名稱"
          value={draft.name}
          onChange={(name) => {
            autoFillByName(name);
            setShowNameSuggestions(Boolean(name.trim()));
          }}
          placeholder="台積電"
          trailing={
            draft.name ? (
              <button type="button" className="rounded-full p-1 text-ink/45 hover:bg-paper hover:text-ink/70" onClick={clearSelectedStock} aria-label="清除股票名稱">
                <X size={14} />
              </button>
            ) : null
          }
        />
        {showNameSuggestions && nameSuggestions.length > 0 && (
          <StockSuggestionMenu items={nameSuggestions} onPick={pickSymbolSuggestion} />
        )}
      </div>
      <Field label="股數" type="number" value={draft.quantity} onChange={(quantity) => setDraft((value) => ({ ...value, quantity }))} />
      {draft.buyMode === "totalAmount" ? (
        <>
          <Field
            label={draft.type === "buy" ? "買入總成本(含手續費)" : "賣出金額"}
            type="text"
            inputMode="decimal"
            value={formatThousandsInput(draft.totalAmount)}
            onChange={(totalAmount) =>
              setDraft((value) => ({
                ...value,
                totalAmount: stripNumberFormatting(totalAmount).replace(/[^\d.]/g, "")
              }))
            }
          />
          <section className="rounded-lg border border-ink/10 bg-paper p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/60">自動計算每股價格</span>
              <strong>{decimal(resolvedUnitPrice, 2)}</strong>
            </div>
          </section>
        </>
      ) : (
        <Field label="成交單價(股)" type="number" value={draft.unitPrice} onChange={(unitPrice) => setDraft((value) => ({ ...value, unitPrice }))} />
      )}
      <Field label="產業別" value={draft.industry} onChange={(industry) => setDraft((value) => ({ ...value, industry }))} placeholder="半導體業 / ETF" />
      {draft.type === "sell" && (
        <section className="rounded-lg border border-mint/20 bg-mint/5 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/65">可賣股數</span>
            <strong>{selectedPosition?.quantity ?? 0} 股</strong>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-ink/65">預估已實現損益</span>
            <strong className={profitClass(estimatedRealizedProfit ?? 0)}>
              {estimatedRealizedProfit === null ? currency(0) : currency(estimatedRealizedProfit)}
            </strong>
          </div>
        </section>
      )}
      <section className="rounded-lg bg-paper p-3 text-sm">
        <div className="flex justify-between">
          <span>成交金額</span>
          <strong>{currency(preview.grossAmount)}</strong>
        </div>
        <div className="mt-2 flex justify-between">
          <span>手續費</span>
          <strong>{currency(preview.fee)}</strong>
        </div>
        <div className="mt-2 flex justify-between">
          <span>交易稅</span>
          <strong>{currency(preview.tax)}</strong>
        </div>
        <div className="mt-2 flex justify-between border-t border-ink/10 pt-2">
          <span>{draft.type === "buy" ? "買入總成本" : "賣出實收"}</span>
          <strong>{currency(preview.netAmount)}</strong>
        </div>
      </section>
      <Field label="添加分類標籤" value={draft.tags} onChange={(tags) => setDraft((value) => ({ ...value, tags }))} placeholder="核心, 長期, 短線" />
      <SubmitButton onClick={onSubmit}>{submitLabel}</SubmitButton>
    </div>
  );
}

export function PortfolioForm({
  draft,
  setDraft,
  onSubmit,
  submitLabel = "新增帳本",
  showInitialAmount = true
}: {
  draft: PortfolioDraft;
  setDraft: (value: PortfolioDraft | ((value: PortfolioDraft) => PortfolioDraft)) => void;
  onSubmit: () => void;
  submitLabel?: string;
  showInitialAmount?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="帳本名稱" value={draft.name} onChange={(name) => setDraft((value) => ({ ...value, name }))} placeholder="台股主帳本" />
      {showInitialAmount ? (
        <Field label="初始金額" type="number" value={draft.initialAmount} onChange={(initialAmount) => setDraft((value) => ({ ...value, initialAmount }))} />
      ) : null}
      <Field label="備註" value={draft.note} onChange={(note) => setDraft((value) => ({ ...value, note }))} />
      <SubmitButton onClick={onSubmit}>{submitLabel}</SubmitButton>
    </div>
  );
}

export function CashForm({ draft, setDraft, portfolios, onSubmit }: { draft: CashDraft; setDraft: (value: CashDraft | ((value: CashDraft) => CashDraft)) => void; portfolios: Portfolio[]; onSubmit: () => void }) {
  return (
    <div className="space-y-3">
      <Select value={draft.portfolioId || portfolios[0]?.id || ""} onChange={(portfolioId) => setDraft((value) => ({ ...value, portfolioId }))} options={portfolios.map((item) => [item.id, item.name])} />
      <Segmented
        value={draft.type}
        onChange={(type) => setDraft((value) => ({ ...value, type: type as CashMovementType }))}
        options={[
          ["deposit", "加入"],
          ["withdraw", "轉出"],
          ["adjust", "修正"]
        ]}
      />
      <Field label="金額" type="number" value={draft.amount} onChange={(amount) => setDraft((value) => ({ ...value, amount }))} />
      <Field label="備註" value={draft.note} onChange={(note) => setDraft((value) => ({ ...value, note }))} />
      <SubmitButton onClick={onSubmit}>儲存資金異動</SubmitButton>
    </div>
  );
}

export function StockPriceForm({
  draft,
  setDraft,
  onSubmit
}: {
  draft: StockDraft;
  setDraft: (value: StockDraft | ((value: StockDraft) => StockDraft)) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="目前價格" type="number" value={draft.currentPrice} onChange={(currentPrice) => setDraft((value) => ({ ...value, currentPrice }))} />
      <SubmitButton onClick={onSubmit}>更新現價</SubmitButton>
    </div>
  );
}

export function StockAdjustForm({
  draft,
  baseline,
  setDraft,
  onSubmit
}: {
  draft: StockDraft;
  baseline: StockAdjustBaseline;
  setDraft: (value: StockDraft | ((value: StockDraft) => StockDraft)) => void;
  onSubmit: () => void;
}) {
  const quantity = Number(draft.quantity || 0);
  const holdingCost = Number(draft.holdingCost || 0);
  const averageCost = quantity > 0 ? holdingCost / quantity : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="持有庫存" type="number" value={draft.quantity} onChange={(quantity) => setDraft((value) => ({ ...value, quantity }))} />
        <Field
          label="持有成本(含手續費)"
          type="text"
          inputMode="decimal"
          value={formatThousandsInput(draft.holdingCost)}
          onChange={(holdingCost) =>
            setDraft((value) => ({
              ...value,
              holdingCost: stripNumberFormatting(holdingCost).replace(/[^\d.]/g, "")
            }))
          }
        />
      </div>
      <section className="rounded-lg border border-ink/10 bg-paper p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">每股均價</span>
          <strong>{decimal(averageCost, 1)}</strong>
        </div>
      </section>
      <Field
        label="產業別"
        value={draft.industry}
        onChange={(industry) => setDraft((value) => ({ ...value, industry }))}
        placeholder="半導體業 / ETF"
      />
      <Field
        label="添加分類標籤"
        value={draft.tags}
        onChange={(tags) => setDraft((value) => ({ ...value, tags }))}
        placeholder="核心, 長期, 短線"
      />
      <section className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm">
        <p className="font-semibold text-ink">校正前對照</p>
        <div className="mt-2 flex justify-between">
          <span className="text-ink/60">系統股數 / 成本</span>
          <strong>{baseline.quantity} 股 / {currency(baseline.holdingCost)}</strong>
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-ink/60">將寫入手動值</span>
          <strong>{quantity} 股 / {currency(holdingCost)}</strong>
        </div>
        <p className="mt-2 text-xs text-ink/60">此操作不會新增交易，僅覆寫顯示用成本。</p>
      </section>
      <SubmitButton onClick={onSubmit}>送出校正</SubmitButton>
    </div>
  );
}

export function SettingsForm({
  settings,
  setSettings,
  dataSyncInfo,
  onSubmit,
  onExport,
  onImport,
  onResetLocal,
  onReloadCatalog,
  onSignOut
}: {
  settings: UserSettings;
  setSettings: (settings: UserSettings) => void;
  dataSyncInfo: { catalogSourceLabel: string; latestQuoteLabel: string; autoRefreshLabel: string };
  onSubmit: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onResetLocal: () => void;
  onReloadCatalog: () => void;
  onSignOut?: () => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="手續費率" type="number" value={String(settings.fee_rate)} onChange={(feeRate) => setSettings({ ...settings, fee_rate: Number(feeRate) })} />
      <Field label="交易稅率" type="number" value={String(settings.tax_rate)} onChange={(taxRate) => setSettings({ ...settings, tax_rate: Number(taxRate) })} />
      <Field label="最低手續費" type="number" value={String(settings.minimum_fee)} onChange={(minimumFee) => setSettings({ ...settings, minimum_fee: Number(minimumFee) })} />
      <section className="rounded-lg border border-ink/10 bg-paper px-3 py-3 text-sm text-ink/70">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-ink">資料與同步</p>
          <button className="rounded-md border border-ink/10 px-2 py-1 text-xs font-semibold text-ink" onClick={onReloadCatalog}>
            重新載入目錄
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-ink/55">目錄來源</span>
            <strong>{dataSyncInfo.catalogSourceLabel}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink/55">現價更新</span>
            <strong>{dataSyncInfo.latestQuoteLabel}</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink/55">自動更新</span>
            <strong>{dataSyncInfo.autoRefreshLabel}</strong>
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-ink/10 bg-paper px-3 py-3 text-sm text-ink/70">
        <p className="font-semibold text-ink">顏色說明</p>
        <p className="mt-1">紅色表示獲利、綠色表示虧損。</p>
      </section>
      <label className="flex items-center justify-between rounded-lg border border-ink/10 p-3">
        <span>允許現金為負</span>
        <input type="checkbox" checked={settings.allow_negative_cash} onChange={(event) => setSettings({ ...settings, allow_negative_cash: event.target.checked })} />
      </label>
      <section className="rounded-lg border border-ink/10 p-3">
        <p className="text-sm font-semibold">備份 / 還原</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center gap-2 rounded-md bg-ink px-3 py-3 text-sm font-semibold text-white" onClick={onExport}>
            <Download size={17} />
            匯出 JSON
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-3 text-sm font-semibold">
            <Upload size={17} />
            匯入 JSON
            <input
              className="hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <button className="mt-2 w-full rounded-md border border-coral/20 px-3 py-3 text-sm font-semibold text-coral" onClick={onResetLocal}>
          重置成本機 demo
        </button>
      </section>
      {onSignOut ? (
        <button className="w-full rounded-md border border-ink/15 px-3 py-3 text-sm font-semibold text-ink" onClick={onSignOut}>
          登出
        </button>
      ) : null}
      <SubmitButton onClick={onSubmit}>儲存設定</SubmitButton>
    </div>
  );
}
