const industryRows = [
  { name: "半導體", value: "$235,500", ratio: "48.2%" },
  { name: "ETF", value: "$88,320", ratio: "18.1%" },
  { name: "AI 伺服器", value: "$76,420", ratio: "15.6%" },
  { name: "IC 載板", value: "$49,100", ratio: "10.1%" },
  { name: "其他", value: "$39,360", ratio: "8.0%" }
];

const trendRows = [
  { label: "05/16", buy: "$45,200", sell: "$0", net: "$45,200" },
  { label: "05/20", buy: "$12,800", sell: "$18,400", net: "-$5,600" },
  { label: "05/24", buy: "$28,500", sell: "$9,100", net: "$19,400" },
  { label: "05/28", buy: "$30,583", sell: "$0", net: "$30,583" }
];

const profitRows = [
  { symbol: "2330 台積電", realized: "$23,388", unrealized: "$114,695" },
  { symbol: "0050 元大台灣50", realized: "$18,974", unrealized: "-$26,738" },
  { symbol: "6669 緯穎", realized: "$0", unrealized: "$2,086" }
];

function DonutLegend() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {industryRows.map((row) => (
        <div key={row.name} className="rounded-lg bg-white px-3 py-2">
          <p className="text-xs text-black/45">{row.name}</p>
          <p className="mt-1 text-sm font-semibold">{row.ratio}</p>
          <p className="mt-1 text-xs text-black/45">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

function TrendChartMock() {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-end gap-3">
        {trendRows.map((row, index) => (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex h-28 items-end gap-1">
              <div className="w-4 rounded-t bg-[#d45c4a]" style={{ height: `${52 + index * 10}px` }} />
              <div className="w-4 rounded-t bg-[#35624d]" style={{ height: `${20 + (3 - index) * 8}px` }} />
            </div>
            <p className="mt-2 text-[11px] text-black/45">{row.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-black/55">
        <span>■ 買入</span>
        <span>■ 賣出</span>
      </div>
    </div>
  );
}

function ProfitList() {
  return (
    <div className="space-y-2">
      {profitRows.map((row) => (
        <div key={row.symbol} className="rounded-lg bg-white px-3 py-3">
          <p className="font-semibold">{row.symbol}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-black/45">已實現</p>
              <p className="mt-1 font-semibold text-[#d45c4a]">{row.realized}</p>
            </div>
            <div>
              <p className="text-xs text-black/45">未實現</p>
              <p className="mt-1 font-semibold text-[#d45c4a]">{row.unrealized}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SchemeA() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 A</p>
          <p className="text-xs text-black/45">單頁卡片式分析儀表板</p>
        </div>
        <span className="rounded-full bg-[#f3efe5] px-3 py-1 text-xs text-black/55">快速上線</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">前 3 大持股</p>
          <p className="mt-1 text-lg font-semibold">81.9%</p>
        </div>
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">近 2 週淨投入</p>
          <p className="mt-1 text-lg font-semibold">$89,583</p>
        </div>
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">未實現總損益</p>
          <p className="mt-1 text-lg font-semibold text-[#ffb3aa]">$118,674</p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl bg-[#fcfbf7] p-3">
          <p className="text-sm font-semibold">產業持股比例</p>
          <div className="mt-3 grid grid-cols-[0.9fr_1.1fr] gap-3">
            <div className="flex items-center justify-center rounded-full border border-dashed border-black/15 bg-white text-xs text-black/45">
              圓餅圖示意
            </div>
            <DonutLegend />
          </div>
        </div>

        <div className="rounded-xl bg-[#fcfbf7] p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">近一個月 / 兩週投資趨勢</p>
            <div className="rounded-lg bg-white p-1 text-xs">
              <span className="rounded-md bg-[#18231d] px-3 py-1 text-white">2 週</span>
              <span className="px-3 py-1 text-black/55">1 個月</span>
            </div>
          </div>
          <div className="mt-3">
            <TrendChartMock />
          </div>
        </div>

        <div className="rounded-xl bg-[#fcfbf7] p-3">
          <p className="text-sm font-semibold">損益排行</p>
          <div className="mt-3">
            <ProfitList />
          </div>
        </div>
      </div>
    </section>
  );
}

function SchemeB() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 B</p>
          <p className="text-xs text-black/45">上摘要、下分頁</p>
        </div>
        <span className="rounded-full bg-[#eef3ec] px-3 py-1 text-xs text-[#3f624b]">手機較舒服</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">前 3 大持股</p>
          <p className="mt-1 text-lg font-semibold">81.9%</p>
        </div>
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">近 2 週淨投入</p>
          <p className="mt-1 text-lg font-semibold">$89,583</p>
        </div>
        <div className="rounded-lg bg-[#18231d] px-3 py-3 text-white">
          <p className="text-[11px] text-white/60">未實現總損益</p>
          <p className="mt-1 text-lg font-semibold text-[#ffb3aa]">$118,674</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-[#f4f1e8] p-1 text-xs">
        <span className="rounded-md bg-white px-3 py-1 shadow-sm">配置</span>
        <span className="px-3 py-1 text-black/55">趨勢</span>
        <span className="px-3 py-1 text-black/55">損益</span>
      </div>

      <div className="mt-3 rounded-xl bg-[#fcfbf7] p-3">
        <p className="text-sm font-semibold">配置</p>
        <div className="mt-3 grid grid-cols-[0.9fr_1.1fr] gap-3">
          <div className="flex items-center justify-center rounded-full border border-dashed border-black/15 bg-white text-xs text-black/45">
            圓餅圖示意
          </div>
          <DonutLegend />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-black/15 bg-white px-4 py-3 text-sm text-black/55">
        在正式版中，切到 `趨勢` 會顯示近 2 週 / 1 個月投資趨勢；切到 `損益` 會顯示已實現 / 未實現損益排行。
      </div>
    </section>
  );
}

export default function AnalyticsLayoutMockPage() {
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-6 text-[#18231d]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4c7a61]">Mockup</p>
          <h1 className="mt-2 text-2xl font-bold">分析頁示意圖</h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            這頁只用來比較 A / B 兩種分析頁版型。差異重點是：A 把所有分析放在同一頁，B 把分析內容拆成下方分頁，讓手機閱讀更集中。
          </p>
        </header>

        <SchemeA />
        <SchemeB />
      </div>
    </main>
  );
}
