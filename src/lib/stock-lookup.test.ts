import { describe, expect, it } from "vitest";
import { findStockByName, findStockBySymbol, fuzzySearchStocks, type StockCatalogItem } from "./stock-lookup";

const catalog: StockCatalogItem[] = [
  { symbol: "3711", name: "日月光投控", industry: "半導體業", market: "TWSE", isEtf: false },
  { symbol: "3771", name: "昇陽半導體", industry: "半導體業", market: "TPEx", isEtf: false },
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
    expect(findStockBySymbol(catalog, "00999")).toMatchObject({ symbol: "00999", industry: "ETF", isEtf: true });
  });
});
