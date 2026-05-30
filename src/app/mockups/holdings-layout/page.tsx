const sampleRows = [
  {
    symbol: "2330",
    name: "台積電",
    quantity: "100 股",
    cost: "$92,131",
    average: "$920.0",
    marketValue: "$235,500",
    profit: "$143,369",
    realizedProfit: "$23,388",
    returnRate: "155.61%",
    tags: ["半導體", "核心"]
  },
  {
    symbol: "0050",
    name: "元大台灣50",
    quantity: "400 股",
    cost: "$68,898",
    average: "$172.0",
    marketValue: "$42,160",
    profit: "-$26,738",
    realizedProfit: "$0",
    returnRate: "-38.81%",
    tags: ["ETF", "長期"]
  },
  {
    symbol: "6669",
    name: "緯穎",
    quantity: "6 股",
    cost: "$30,584",
    average: "$5,090.0",
    marketValue: "$32,670",
    profit: "$2,086",
    realizedProfit: "$0",
    returnRate: "6.82%",
    tags: ["電腦及週邊設備業"]
  }
];

function Chip({ label }: { label: string }) {
  return <span className="rounded-full bg-[#eef3ec] px-2 py-1 text-[11px] text-[#3f624b]">{label}</span>;
}

function SchemeA() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 A</p>
          <p className="text-xs text-black/45">保留卡片感，縮短高度</p>
        </div>
        <span className="rounded-full bg-[#f3efe5] px-3 py-1 text-xs text-black/55">延續現有風格</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                <p className="mt-1 font-semibold">{row.cost}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">市值</p>
                <p className="mt-1 font-semibold">{row.marketValue}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">每股均價</p>
                <p className="mt-1 font-semibold">{row.average}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">預估損益</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.profit}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">報酬率</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.returnRate}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RealizedSchemeA() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">已實現方案 A</p>
          <p className="text-xs text-black/45">保留主卡乾淨，底部只放一行提示</p>
        </div>
        <span className="rounded-full bg-[#f3efe5] px-3 py-1 text-xs text-black/55">最少干擾</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol + "-realized-a"} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 rounded-lg bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                  <p className="mt-1 font-semibold">{row.cost}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-black/45">市值</p>
                  <p className="mt-1 font-semibold">{row.marketValue}</p>
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">每股均價</p>
                <p className="mt-1 font-semibold">{row.average}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">報酬率</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.returnRate}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">預估損益</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.profit}</p>
              </div>
            </div>
            {row.realizedProfit !== "$0" ? <p className="mt-3 text-xs text-black/55">{"已實現損益 " + row.realizedProfit}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function RealizedSchemeB() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">已實現方案 B</p>
          <p className="text-xs text-black/45">做成可展開次資訊</p>
        </div>
        <span className="rounded-full bg-[#eef3ec] px-3 py-1 text-xs text-[#3f624b]">主卡最乾淨</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol + "-realized-b"} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 rounded-lg bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                  <p className="mt-1 font-semibold">{row.cost}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-black/45">市值</p>
                  <p className="mt-1 font-semibold">{row.marketValue}</p>
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">每股均價</p>
                <p className="mt-1 font-semibold">{row.average}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">報酬率</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.returnRate}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">預估損益</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.profit}</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-dashed border-black/10 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-black/60">查看已實現損益</span>
                <span className="text-black/45">展開</span>
              </div>
              {row.realizedProfit !== "$0" ? (
                <div className="mt-2 border-t border-black/8 pt-2">
                  <p className="text-[11px] text-black/45">已實現損益</p>
                  <p className="mt-1 text-sm font-semibold text-[#d45c4a]">{row.realizedProfit}</p>
                </div>
              ) : null}
            </div>
          </article>
        ))}
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
          <p className="text-xs text-black/45">列表列式，最省高度</p>
        </div>
        <span className="rounded-full bg-[#eaf4ef] px-3 py-1 text-xs text-[#35624d]">大量持股最佳</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-black/10">
        {sampleRows.map((row, index) => (
          <article key={row.symbol} className={"bg-white px-3 py-3 " + (index ? "border-t border-black/8" : "")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{row.symbol + " " + row.name}</p>
                  <button className="shrink-0 rounded-md border border-black/10 px-2 py-1 text-[11px]">調整</button>
                </div>
                <p className="mt-1 truncate text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
                <p className="mt-2 truncate text-xs text-black/55">{"持有成本(含手續費) " + row.cost + " · 每股均價 " + row.average + " · 預估損益 " + row.profit}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.tags.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{row.marketValue}</p>
                <p className="mt-1 text-xs text-[#d45c4a]">{row.returnRate}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SchemeC() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 C</p>
          <p className="text-xs text-black/45">雙模式切換</p>
        </div>
        <div className="rounded-lg bg-[#f4f1e8] p-1 text-xs">
          <span className="rounded-md bg-white px-3 py-1 shadow-sm">精簡</span>
          <span className="px-3 py-1 text-black/55">詳細</span>
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-black/15 bg-[#fcfbf7] p-4">
        <p className="text-sm font-medium">概念：</p>
        <ul className="mt-2 space-y-2 text-sm text-black/65">
          <li>• 預設顯示「精簡列表」，優先掃描市值與報酬率</li>
          <li>• 切到「詳細」後，才顯示完整成本 / 市值 / 損益格狀資訊</li>
          <li>• 適合未來持股很多、但偶爾仍需要單檔細看</li>
        </ul>
      </div>
    </section>
  );
}

function SchemeD() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 D</p>
          <p className="text-xs text-black/45">雙列主資訊，三個次資訊</p>
        </div>
        <span className="rounded-full bg-[#f3efe5] px-3 py-1 text-xs text-black/55">資訊最均衡</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                <p className="mt-1 font-semibold">{row.cost}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">市值</p>
                <p className="mt-1 font-semibold">{row.marketValue}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">每股均價</p>
                <p className="mt-1 font-semibold">{row.average}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">預估損益</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.profit}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">報酬率</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.returnRate}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SchemeE() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 E</p>
          <p className="text-xs text-black/45">左資訊、右績效的卡片分區</p>
        </div>
        <span className="rounded-full bg-[#eef3ec] px-3 py-1 text-xs text-[#3f624b]">績效最醒目</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 grid grid-cols-[1.2fr_0.8fr] gap-2">
              <div className="space-y-2">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                  <p className="mt-1 font-semibold">{row.cost}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-black/45">市值</p>
                  <p className="mt-1 font-semibold">{row.marketValue}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-black/45">每股均價</p>
                  <p className="mt-1 font-semibold">{row.average}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-black/45">預估損益</p>
                  <p className="mt-1 text-lg font-semibold text-[#d45c4a]">{row.profit}</p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-[11px] text-black/45">報酬率</p>
                  <p className="mt-1 text-lg font-semibold text-[#d45c4a]">{row.returnRate}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SchemeF() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">方案 F</p>
          <p className="text-xs text-black/45">上方摘要，下方雙欄細節</p>
        </div>
        <span className="rounded-full bg-[#f5eede] px-3 py-1 text-xs text-[#7b5c2e]">最像儀表板</span>
      </div>
      <div className="space-y-3">
        {sampleRows.map((row) => (
          <article key={row.symbol} className="rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{row.symbol + " " + row.name}</p>
                <p className="mt-1 text-xs text-black/50">{row.quantity + " · " + row.tags[0]}</p>
              </div>
              <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
            </div>
            <div className="mt-3 rounded-lg bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                  <p className="mt-1 font-semibold">{row.cost}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-black/45">市值</p>
                  <p className="mt-1 font-semibold">{row.marketValue}</p>
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">每股均價</p>
                <p className="mt-1 font-semibold">{row.average}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">報酬率</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.returnRate}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-white px-3 py-2">
                <p className="text-[11px] text-black/45">預估損益</p>
                <p className="mt-1 font-semibold text-[#d45c4a]">{row.profit}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HoldingsLayoutMockPage() {
  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-6 text-[#18231d]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4c7a61]">Mockup</p>
          <h1 className="mt-2 text-2xl font-bold">持股頁示意圖</h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            這頁不是正式功能，只是快速比較三種排版。重點差異放在「持有成本(含手續費) 和 市值的相對位置」以及「持股很多時頁面長度」。
          </p>
        </header>

        <SchemeA />
        <RealizedSchemeA />
        <RealizedSchemeB />
        <SchemeD />
        <SchemeE />
        <SchemeF />
        <SchemeB />
        <SchemeC />
      </div>
    </main>
  );
}
