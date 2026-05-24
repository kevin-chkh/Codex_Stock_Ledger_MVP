import { NextRequest, NextResponse } from "next/server";

type QuoteRequestItem = {
  symbol: string;
  market?: string;
};

type QuoteResponseItem = {
  symbol: string;
  market: string;
  price: number;
  priceUpdatedAt: string;
  source: "mis.twse.com.tw" | "tpex_mainboard_quotes" | "mis.tpex.org.tw";
};

type MisRow = Record<string, unknown>;

const MARKET_ALIASES: Record<string, "TWSE" | "TPEx" | "Emerging"> = {
  TW: "TWSE",
  TSE: "TWSE",
  TWSE: "TWSE",
  OTC: "TPEx",
  TPEX: "TPEx",
  TPEx: "TPEx",
  EMERGING: "Emerging",
  ESB: "Emerging"
};

function normalizeMarket(market?: string) {
  if (!market) return "TWSE";
  return MARKET_ALIASES[market.toUpperCase()] ?? "TWSE";
}

function readString(row: MisRow, key: string) {
  const value = row[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function parseNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "--") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseFirstNumberList(value: string) {
  for (const item of value.split("_")) {
    const parsed = parseNumber(item);
    if (parsed !== null) return parsed;
  }
  return null;
}

function roundPrice(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractMisPrice(row: MisRow) {
  const latest = parseNumber(readString(row, "z"));
  if (latest !== null) return latest;

  const bid = parseFirstNumberList(readString(row, "b"));
  const ask = parseFirstNumberList(readString(row, "a"));
  if (bid !== null && ask !== null) return roundPrice((bid + ask) / 2);
  if (bid !== null) return bid;
  if (ask !== null) return ask;

  return parseNumber(readString(row, "y"));
}

function parseMisTimestamp(row: MisRow) {
  const tlong = parseNumber(readString(row, "tlong"));
  if (tlong !== null && tlong > 0) return new Date(tlong).toISOString();

  const date = readString(row, "d");
  const time = readString(row, "t");
  if (/^\d{8}$/.test(date) && /^\d{2}:\d{2}:\d{2}$/.test(time)) {
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time}+08:00`;
    return new Date(iso).toISOString();
  }

  return new Date().toISOString();
}

function parseChannelKey(row: MisRow) {
  const key = readString(row, "key");
  if (key) return key.replace(/_\d+$/, "");

  const exchange = readString(row, "ex");
  const symbol = readString(row, "c");
  if (exchange && symbol) return `${exchange}_${symbol}.tw`;
  return "";
}

function channelFor(symbol: string, market: "TWSE" | "TPEx" | "Emerging") {
  if (market === "TWSE") return [`tse_${symbol}.tw`];
  if (market === "TPEx") return [`otc_${symbol}.tw`];
  return [`esb_${symbol}.tw`, `otc_${symbol}.tw`];
}

async function fetchMisQuotes(items: QuoteRequestItem[]) {
  const plans = new Map<string, { channels: string[]; market: "TWSE" | "TPEx" | "Emerging" }>();

  for (const item of items) {
    const symbol = item.symbol.trim();
    if (!symbol) continue;
    const market = normalizeMarket(item.market);
    plans.set(symbol, { channels: channelFor(symbol, market), market });
  }

  if (!plans.size) return new Map<string, QuoteResponseItem>();

  const channels = [...new Set([...plans.values()].flatMap((plan) => plan.channels))];
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=${encodeURIComponent(channels.join("|"))}&_=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      referer: "https://mis.twse.com.tw/stock/index.jsp"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("quote request failed");

  const payload = (await response.json()) as { msgArray?: MisRow[] };
  const rows = Array.isArray(payload.msgArray) ? payload.msgArray : [];
  const results = new Map<string, { rank: number; quote: QuoteResponseItem }>();

  for (const row of rows) {
    const symbol = readString(row, "c");
    const channel = parseChannelKey(row);
    const plan = plans.get(symbol);
    if (!plan) continue;

    const rank = plan.channels.indexOf(channel);
    if (rank < 0) continue;

    const price = extractMisPrice(row);
    if (price === null) continue;

    const current = results.get(symbol);
    if (current && current.rank <= rank) continue;

    results.set(symbol, {
      rank,
      quote: {
        symbol,
        market: plan.market,
        price,
        priceUpdatedAt: parseMisTimestamp(row),
        source: "mis.twse.com.tw"
      }
    });
  }

  return new Map([...results.entries()].map(([symbol, entry]) => [symbol, entry.quote]));
}

function parseRocDate(value: string) {
  if (!/^\d{7}$/.test(value)) return new Date().toISOString();
  const year = Number(value.slice(0, 3)) + 1911;
  const month = value.slice(3, 5);
  const day = value.slice(5, 7);
  return new Date(`${year}-${month}-${day}T13:30:00+08:00`).toISOString();
}

function extractTpexPrice(row: MisRow) {
  const close = parseNumber(readString(row, "Close"));
  if (close !== null) return close;

  const bid = parseNumber(readString(row, "LatestBidPrice"));
  const ask = parseNumber(readString(row, "LatesAskPrice"));
  if (bid !== null && ask !== null) return roundPrice((bid + ask) / 2);
  return bid ?? ask;
}

async function fetchTpexMainboardQuotes(items: QuoteRequestItem[]) {
  const symbols = new Set(items.map((item) => item.symbol.trim()).filter(Boolean));
  if (!symbols.size) return new Map<string, QuoteResponseItem>();

  const response = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("tpex quote request failed");

  const rows = (await response.json()) as MisRow[];
  const results = new Map<string, QuoteResponseItem>();

  for (const row of rows) {
    const symbol = readString(row, "SecuritiesCompanyCode");
    if (!symbols.has(symbol)) continue;

    const price = extractTpexPrice(row);
    if (price === null) continue;

    results.set(symbol, {
      symbol,
      market: "TPEx",
      price,
      priceUpdatedAt: parseRocDate(readString(row, "Date")),
      source: "tpex_mainboard_quotes"
    });
  }

  return results;
}

function extractXmlField(xml: string, field: string) {
  const match = xml.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function parseTimeToIso(dateText: string, timeText: string) {
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(dateText)) return new Date().toISOString();
  const normalizedTime = /^\d{6}$/.test(timeText)
    ? `${timeText.slice(0, 2)}:${timeText.slice(2, 4)}:${timeText.slice(4, 6)}`
    : /^\d{2}:\d{2}:\d{2}$/.test(timeText)
      ? timeText
      : "13:30:00";
  return new Date(`${dateText.replace(/\//g, "-")}T${normalizedTime}+08:00`).toISOString();
}

function extractTpexEmergingPrice(xml: string) {
  const tradePrice = parseNumber(extractXmlField(xml, "TradePrice"));
  if (tradePrice !== null) return tradePrice;

  const average = parseNumber(extractXmlField(xml, "TradeStatisticAverage"));
  if (average !== null) return average;

  const bestBid = parseNumber(extractXmlField(xml, "BuyPrice"));
  const bestAsk = parseNumber(extractXmlField(xml, "SellPrice"));
  if (bestBid !== null && bestAsk !== null) return roundPrice((bestBid + bestAsk) / 2);
  return bestBid ?? bestAsk;
}

async function fetchTpexEmergingQuotes(items: QuoteRequestItem[]) {
  const quotes = new Map<string, QuoteResponseItem>();

  for (const item of items) {
    const symbol = item.symbol.trim();
    if (!symbol) continue;

    const response = await fetch("https://mis.tpex.org.tw/Quote.asmx/GETQ20", {
      method: "POST",
      headers: {
        accept: "text/xml, application/xml, text/plain, */*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://mis.tpex.org.tw",
        referer: `https://mis.tpex.org.tw/ib120stk.aspx?SymbolID=${symbol}`,
        "x-requested-with": "XMLHttpRequest"
      },
      body: new URLSearchParams({ SymbolID: symbol }).toString(),
      cache: "no-store"
    });

    if (!response.ok) continue;

    const xml = await response.text();
    const resolvedSymbol = extractXmlField(xml, "SymbolID");
    if (!resolvedSymbol) continue;

    const price = extractTpexEmergingPrice(xml);
    if (price === null) continue;

    quotes.set(symbol, {
      symbol: resolvedSymbol,
      market: "Emerging",
      price,
      priceUpdatedAt: parseTimeToIso(extractXmlField(xml, "TradeDay"), extractXmlField(xml, "TradeStatisticTime")),
      source: "mis.tpex.org.tw"
    });
  }

  return quotes;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: QuoteRequestItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    const quotes = await fetchMisQuotes(items);
    const unresolvedTpexItems = items.filter((item) => normalizeMarket(item.market) === "TPEx" && !quotes.has(item.symbol.trim()));
    if (unresolvedTpexItems.length) {
      const tpexQuotes = await fetchTpexMainboardQuotes(unresolvedTpexItems);
      for (const [symbol, quote] of tpexQuotes) {
        quotes.set(symbol, quote);
      }
    }
    const unresolvedEmergingItems = items.filter((item) => normalizeMarket(item.market) === "Emerging" && !quotes.has(item.symbol.trim()));
    if (unresolvedEmergingItems.length) {
      const emergingQuotes = await fetchTpexEmergingQuotes(unresolvedEmergingItems);
      for (const [symbol, quote] of emergingQuotes) {
        quotes.set(symbol, quote);
      }
    }
    const requestedSymbols = items.map((item) => item.symbol.trim()).filter(Boolean);
    const failedSymbols = requestedSymbols.filter((symbol) => !quotes.has(symbol));

    return NextResponse.json(
      {
        quotes: [...quotes.values()],
        failedSymbols
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: "failed to fetch stock quotes",
        detail: error instanceof Error ? error.message : "unknown error"
      },
      { status: 502 }
    );
  }
}
