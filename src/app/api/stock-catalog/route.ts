import { NextResponse } from "next/server";

type StockCatalogItem = {
  symbol: string;
  name: string;
  industry: string;
  market: "TWSE" | "TPEx" | "Emerging";
  isEtf: boolean;
};

const TPEX_INDUSTRY_MAP: Record<string, string> = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "13": "電子工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險業",
  "18": "貿易百貨",
  "19": "綜合",
  "20": "其他",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "32": "文化創意業",
  "33": "農業科技業",
  "34": "電子商務",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活",
  "80": "管理股票"
};

const ETF_SYMBOL_PATTERN = /^0[0-9A-Z]{3,}$/i;

async function fetchJsonRows(url: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`catalog request failed: ${url}`);
  const rows = await response.json();
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

async function fetchTwseTableRows(url: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`catalog request failed: ${url}`);

  const payload = (await response.json()) as {
    fields?: string[];
    data?: unknown[][];
  };

  if (!Array.isArray(payload.fields) || !Array.isArray(payload.data)) return [];

  return payload.data
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) =>
      payload.fields!.reduce<Record<string, unknown>>((record, field, index) => {
        record[field] = row[index];
        return record;
      }, {})
    );
}

function readString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function normalizeIndustry(symbol: string, rawIndustry: string) {
  if (ETF_SYMBOL_PATTERN.test(symbol)) return "ETF";
  const industry = rawIndustry.trim();
  return TPEX_INDUSTRY_MAP[industry] || industry || "未分類";
}

function normalizeCatalogRow(row: Record<string, unknown>, market: StockCatalogItem["market"]): StockCatalogItem | null {
  const symbol = readString(row, ["公司代號", "股票代號", "證券代號", "SecuritiesCompanyCode", "Code", "有價證券代號"]);
  const name = readString(row, ["公司簡稱", "證券簡稱", "股票簡稱", "公司名稱", "股票名稱", "CompanyName", "Name", "有價證券名稱"]);
  const rawIndustry = readString(row, ["產業別", "IndustryCategory", "Industry", "產業類別"]);

  if (!symbol || !name) return null;

  return {
    symbol,
    name,
    industry: normalizeIndustry(symbol, rawIndustry),
    market,
    isEtf: ETF_SYMBOL_PATTERN.test(symbol)
  };
}

async function fetchTwseCatalog() {
  const rows = await fetchJsonRows("https://openapi.twse.com.tw/v1/opendata/t187ap03_L");
  return rows.map((row) => normalizeCatalogRow(row, "TWSE")).filter(Boolean) as StockCatalogItem[];
}

async function fetchTwseEtfCatalog() {
  const rows = await fetchTwseTableRows("https://www.twse.com.tw/rwd/zh/ETF/list?response=json");
  return rows.map((row) => normalizeCatalogRow(row, "TWSE")).filter(Boolean) as StockCatalogItem[];
}

async function fetchTpexCatalog() {
  const rows = await fetchJsonRows("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O");
  return rows.map((row) => normalizeCatalogRow(row, "TPEx")).filter(Boolean) as StockCatalogItem[];
}

async function fetchTpexEmergingCatalog() {
  const rows = await fetchJsonRows("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R");
  return rows.map((row) => normalizeCatalogRow(row, "Emerging")).filter(Boolean) as StockCatalogItem[];
}

function mergeCatalog(items: StockCatalogItem[]) {
  const map = new Map<string, StockCatalogItem>();
  for (const item of items) {
    const existing = map.get(item.symbol);
    if (!existing) {
      map.set(item.symbol, item);
      continue;
    }

    map.set(item.symbol, {
      symbol: item.symbol,
      name: existing.name || item.name,
      industry: existing.industry && existing.industry !== "未分類" ? existing.industry : item.industry,
      market: existing.market || item.market,
      isEtf: existing.isEtf || item.isEtf
    });
  }
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export async function GET() {
  try {
    const [twseRows, twseEtfRows, tpexRows, tpexEmergingRows] = await Promise.all([
      fetchTwseCatalog(),
      fetchTwseEtfCatalog(),
      fetchTpexCatalog(),
      fetchTpexEmergingCatalog()
    ]);
    const merged = mergeCatalog([...twseRows, ...twseEtfRows, ...tpexRows, ...tpexEmergingRows]);
    return NextResponse.json(merged, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: "failed to fetch stock catalog",
        detail: error instanceof Error ? error.message : "unknown error"
      },
      { status: 502 }
    );
  }
}
