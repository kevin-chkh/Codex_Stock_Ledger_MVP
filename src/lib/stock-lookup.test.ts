import { describe, expect, it } from "vitest";
import { findStockByName, findStockBySymbol, fuzzySearchBySymbol, fuzzySearchStocks, loadStockCatalog, type StockCatalogItem } from "./stock-lookup";

const catalog: StockCatalogItem[] = [
  { symbol: "3711", name: "日月光投控", industry: "半導體業", market: "TWSE", isEtf: false },
  { symbol: "3771", name: "昇陽半導體", industry: "半導體業", market: "Emerging", isEtf: false },
  { symbol: "0050", name: "元大台灣50", industry: "ETF", market: "TWSE", isEtf: true }
];

describe("stock lookup", () => {
  it("finds stocks by symbol", () => {
    expect(findStockBySymbol(catalog, "3711")?.name).toBe("日月光投控");
    expect(findStockBySymbol(catalog, "3771")?.industry).toBe("半導體業");
  });

  it("finds stocks by partial name", () => {
    expect(findStockByName(catalog, "昇陽")?.symbol).toBe("3771");
  });

  it("searches by symbol or name", () => {
    expect(fuzzySearchStocks(catalog, "37").map((item) => item.symbol)).toEqual(["3711", "3771"]);
    expect(fuzzySearchStocks(catalog, "台灣50")[0].symbol).toBe("0050");
  });

  it("returns an ETF fallback for unknown 00-prefixed symbols", () => {
    expect(findStockBySymbol(catalog, "00999")).toMatchObject({ symbol: "00999", industry: "ETF", market: "TWSE", isEtf: true });
  });

  it("returns an ETF fallback for active ETF symbols with letter suffixes", () => {
    expect(findStockBySymbol(catalog, "00981a")).toMatchObject({ symbol: "00981A", industry: "ETF", market: "TWSE", isEtf: true });
    expect(findStockBySymbol(catalog, "00403A")).toMatchObject({ symbol: "00403A", industry: "ETF", market: "TWSE", isEtf: true });
  });

  it("suggests unknown active ETF symbols in stock search", () => {
    expect(fuzzySearchBySymbol(catalog, "00981A")[0]).toMatchObject({ symbol: "00981A", industry: "ETF", isEtf: true });
    expect(fuzzySearchStocks(catalog, "00403A")[0]).toMatchObject({ symbol: "00403A", industry: "ETF", isEtf: true });
  });

  it("keeps ADATA in fallback catalog with industry", async () => {
    const result = await loadStockCatalog();
    expect(findStockBySymbol(result.catalog, "3260")).toMatchObject({ symbol: "3260", name: "威剛", industry: "半導體業", market: "TPEx" });
  });
});
