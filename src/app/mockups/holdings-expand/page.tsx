const sampleRows = [
  ["2330", "台積電", "300 股", "$283,766", "$435,350", "$151,584", "53.42%", "半導體業"],
  ["2303", "聯電", "300 股", "$28,766", "$43,350", "$14,584", "50.70%", "半導體業"],
  ["0050", "元大台灣50", "400 股", "$68,898", "$42,160", "-$26,738", "-38.81%", "ETF"],
  ["6669", "緯穎", "6 股", "$30,584", "$32,670", "$2,086", "6.82%", "電腦及週邊設備業"],
  ["3711", "日月光投控", "70 股", "$34,063", "$39,520", "$5,457", "16.02%", "半導體業"],
  ["00881", "國泰台灣科技龍頭", "650 股", "$16,644", "$21,255", "$4,611", "27.70%", "ETF"],
  ["2382", "廣達", "165 股", "$53,347", "$56,940", "$3,593", "6.73%", "電腦及週邊設備業"],
  ["2451", "創見", "25 股", "$7,535", "$7,673", "$138", "1.83%", "記憶體"],
  ["5536", "聖暉*", "75 股", "$57,233", "$64,227", "$6,994", "12.22%", "其他電子"],
  ["8046", "南電", "60 股", "$61,731", "$52,857", "-$8,874", "-14.38%", "半導體業"]
].map(([symbol, name, quantity, cost, value, profit, rate, industry]) => ({
  symbol,
  name,
  quantity,
  cost,
  value,
  profit,
  rate,
  industry
}));

function Card({ row }: { row: (typeof sampleRows)[number] }) {
  return (
    <article className="rounded-xl border border-black/10 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{row.symbol} {row.name}</p>
          <p className="mt-1 text-xs text-black/50">{row.quantity} · {row.industry}</p>
        </div>
        <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
      </div>
      <div className="mt-3 rounded-lg bg-[#f7f4ee] px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
            <p className="mt-1 font-semibold">{row.cost}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-black/45">市值</p>
            <p className="mt-1 font-semibold">{row.value}</p>
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#f7f4ee] px-3 py-2">
          <p className="text-[11px] text-black/45">每股均價</p>
          <p className="mt-1 font-semibold">--</p>
        </div>
        <div className="rounded-lg bg-[#f7f4ee] px-3 py-2">
          <p className="text-[11px] text-black/45">預估損益</p>
          <p className={"mt-1 font-semibold " + (row.profit.startsWith("-") ? "text-[#35624d]" : "text-[#d45c4a]")}>{row.profit}</p>
        </div>
        <div className="rounded-lg bg-[#f7f4ee] px-3 py-2">
          <p className="text-[11px] text-black/45">報酬率</p>
          <p className={"mt-1 font-semibold " + (row.rate.startsWith("-") ? "text-[#35624d]" : "text-[#d45c4a]")}>{row.rate}</p>
        </div>
      </div>
    </article>
  );
}

function Section({
  title,
  subtitle,
  children,
  badge
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  badge: string;
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-black/45">{subtitle}</p>
        </div>
        <span className="rounded-full bg-[#f3efe5] px-3 py-1 text-xs text-black/55">{badge}</span>
      </div>
      {children}
    </section>
  );
}

function SchemeA() {
  return (
    <Section title="方案 A" subtitle="預設只顯示前 5 檔，逐步展開剩餘持股" badge="最直覺">
      <div className="space-y-3">
        {sampleRows.slice(0, 5).map((row) => <Card key={row.symbol} row={row} />)}
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-black/15 bg-[#fcfbf7] px-4 py-4">
        <p className="text-sm font-medium">還有 5 檔未展開</p>
        <div className="mt-3 flex gap-2">
          <button className="flex-1 rounded-lg bg-[#17211f] px-4 py-3 text-sm font-semibold text-white">繼續展開 5 檔</button>
          <button className="rounded-lg border border-black/10 px-4 py-3 text-sm">全部展開</button>
        </div>
      </div>
    </Section>
  );
}

function SchemeB() {
  return (
    <Section title="方案 B" subtitle="先顯示重點持股，其餘收合在次區塊" badge="重點優先">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">重點持股 3 檔</p>
          <span className="text-xs text-black/45">依市值排序</span>
        </div>
        <div className="space-y-3">
          {sampleRows.slice(0, 3).map((row) => <Card key={row.symbol} row={row} />)}
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-black/10 bg-[#fcfbf7] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">其餘持股 7 檔</p>
            <p className="mt-1 text-xs text-black/45">次要部位預設收合，避免頁面過長</p>
          </div>
          <button className="rounded-lg border border-black/10 px-4 py-2 text-sm">展開列表</button>
        </div>
      </div>
    </Section>
  );
}

function SchemeC() {
  return (
    <Section title="方案 C" subtitle="先看精簡列，點選單檔再展開完整卡片" badge="最省高度">
      <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
        {sampleRows.slice(0, 6).map((row, index) => (
          <div key={row.symbol} className={"px-3 py-3 " + (index ? "border-t border-black/8" : "")}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{row.symbol} {row.name}</p>
                <p className="mt-1 truncate text-xs text-black/50">{row.quantity} · {row.industry}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{row.value}</p>
                <p className={"mt-1 text-xs " + (row.rate.startsWith("-") ? "text-[#35624d]" : "text-[#d45c4a]")}>{row.rate}</p>
              </div>
            </div>
            {index === 1 ? (
              <div className="mt-3 rounded-xl border border-black/10 bg-[#fcfbf7] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-black/45">持有成本(含手續費)</p>
                    <p className="mt-1 font-semibold">{row.cost}</p>
                  </div>
                  <button className="rounded-md border border-black/10 px-3 py-1.5 text-xs">調整</button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[11px] text-black/45">市值</p>
                    <p className="mt-1 font-semibold">{row.value}</p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[11px] text-black/45">預估損益</p>
                    <p className={"mt-1 font-semibold " + (row.profit.startsWith("-") ? "text-[#35624d]" : "text-[#d45c4a]")}>{row.profit}</p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[11px] text-black/45">報酬率</p>
                    <p className={"mt-1 font-semibold " + (row.rate.startsWith("-") ? "text-[#35624d]" : "text-[#d45c4a]")}>{row.rate}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <button className="rounded-lg border border-black/10 px-4 py-3 text-sm">載入更多持股</button>
      </div>
    </Section>
  );
}

export default function HoldingsExpandMockupPage() {
  return (
    <main className="min-h-screen bg-[#f6f3ea] px-4 py-6 text-[#171717]">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-[#35624d]">Stock Ledger</p>
          <h1 className="mt-1 text-2xl font-bold">持股展開策略示意</h1>
          <p className="mt-2 text-sm text-black/55">情境：當持股可能超過 20 檔時，如何避免整頁預設全部展開，同時保留繼續查看的能力。</p>
        </header>

        <SchemeA />
        <SchemeB />
        <SchemeC />
      </div>
    </main>
  );
}
