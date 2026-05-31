function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-sm font-semibold text-black">{title}</p>
        <p className="mt-1 text-xs text-black/50">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function ActionButton({ label, tone = "default" }: { label: string; tone?: "default" | "danger" | "primary" }) {
  const className =
    tone === "danger"
      ? "border-coral/20 bg-coral/8 text-coral"
      : tone === "primary"
        ? "border-mint/20 bg-mint/10 text-mint"
        : "border-black/10 bg-white text-black/70";
  return <button className={"rounded-full border px-3 py-2 text-xs font-semibold " + className}>{label}</button>;
}

function PortfolioCardMock() {
  return (
    <Section title="方案 A：帳本卡改版" subtitle="預設帳本改成 badge，操作按鈕放到第二列，避免手機寬度擠壓。">
      <article className="rounded-2xl border border-black/10 bg-[#fcfbf7] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-black">台股主帳本</p>
              <span className="rounded-full border border-mint/20 bg-mint/10 px-2.5 py-1 text-[11px] font-semibold text-mint">預設帳本</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-black">$413,431</p>
            <p className="mt-1 text-xs text-black/45">3 筆資金異動</p>
          </div>
          <p className="text-xs text-black/35">TWD</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton label="資金異動" tone="primary" />
          <ActionButton label="重新命名" />
          <ActionButton label="刪除" tone="danger" />
        </div>
      </article>
    </Section>
  );
}

function PortfolioCardMockB() {
  return (
    <Section title="方案 B：帳本卡雙排按鈕" subtitle="保留按鈕邏輯，但把操作拆成兩排，降低單列擠壓。">
      <article className="rounded-2xl border border-black/10 bg-[#fcfbf7] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-black">台股主帳本</p>
            <p className="mt-2 text-sm font-semibold text-black">$413,431</p>
            <p className="mt-1 text-xs text-black/45">3 筆資金異動</p>
          </div>
          <p className="text-xs text-black/35">TWD</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ActionButton label="預設帳本" tone="primary" />
          <ActionButton label="資金異動" tone="primary" />
          <ActionButton label="重新命名" />
          <ActionButton label="刪除" tone="danger" />
        </div>
      </article>
    </Section>
  );
}

function InfoTipMock() {
  return (
    <Section title="方案 A：首頁說明改 bottom sheet" subtitle="手機上不再用右上浮動 tooltip，改成下方說明面板，避免裁切與被蓋掉。">
      <div className="rounded-2xl bg-[#17211f] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/55">持倉成本</p>
            <p className="mt-2 text-2xl font-bold">$173,186</p>
          </div>
          <button className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold">?</button>
        </div>
      </div>
      <div className="mt-4 rounded-[24px] border border-black/10 bg-white p-4 shadow-sm">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-black/10" />
        <p className="mt-4 text-sm font-semibold text-black">持倉成本說明</p>
        <div className="mt-3 space-y-2 text-sm leading-6 text-black/65">
          <p>持倉成本為目前尚持有部位的剩餘成本，包含買入手續費。</p>
          <p>若你曾賣出部分持股，已賣出的成本不會再留在這個數字裡。</p>
        </div>
        <button className="mt-4 w-full rounded-xl bg-[#17211f] px-4 py-3 text-sm font-semibold text-white">知道了</button>
      </div>
    </Section>
  );
}

function InfoTipMockB() {
  return (
    <Section title="方案 B：首頁說明置中浮層" subtitle="保留 tooltip 類型，但改成手機寬度內的置中浮層，避免右側裁切。">
      <div className="rounded-2xl bg-[#17211f] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/55">總持股報酬</p>
            <p className="mt-2 text-2xl font-bold text-[#f07a67]">$113,431</p>
          </div>
          <button className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold">?</button>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-black">總持股報酬說明</p>
        <div className="mt-3 space-y-2 text-sm leading-6 text-black/65">
          <p>總持股報酬等於已實現損益加未實現損益。</p>
          <p>這個數字偏向整體投資成果，不只反映目前帳上的持股。</p>
        </div>
      </div>
    </Section>
  );
}

function LegendRow({ color, label, amount, ratio }: { color: string; label: string; amount: string; ratio: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-black/8 bg-[#fcfbf7] px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-black">{label}</p>
          <p className="mt-0.5 text-xs tabular-nums text-black/45">{amount}</p>
        </div>
      </div>
      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-black/70">{ratio}</span>
    </div>
  );
}

function AnalyticsPieMock() {
  return (
    <Section title="方案 A：圓餅圖摘要上移" subtitle="移除中心互動 overlay，最大占比改放在圖上方摘要，圖下只保留乾淨圖例。">
      <div className="rounded-2xl border border-black/8 bg-[#fcfbf7] p-4">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-black/8 bg-white px-3 py-3">
          <div>
            <p className="text-xs text-black/45">最大占比</p>
            <p className="mt-1 text-base font-semibold text-black">半導體</p>
          </div>
          <span className="rounded-full bg-[#eaf4ee] px-3 py-1.5 text-sm font-bold tabular-nums text-[#2f7f68]">71.57%</span>
        </div>

        <div className="flex justify-center py-2">
          <div className="relative h-40 w-40">
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(#2f7f68_0deg_258deg,#d2a03a_258deg_316deg,#c76a63_316deg_360deg)]" />
            <div className="absolute inset-[26px] rounded-full bg-white" />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <LegendRow color="#2f7f68" label="半導體" amount="$188,400" ratio="71.57%" />
          <LegendRow color="#d2a03a" label="ETF" amount="$42,160" ratio="16.02%" />
          <LegendRow color="#c76a63" label="電腦及週邊設備業" amount="$32,670" ratio="12.41%" />
        </div>
      </div>
    </Section>
  );
}

function AnalyticsPieMockB() {
  return (
    <Section title="方案 B：圖下固定明細卡" subtitle="保留圓餅圖互動，但不要浮動 tooltip，點擊後在圖下方顯示明細卡。">
      <div className="rounded-2xl border border-black/8 bg-[#fcfbf7] p-4">
        <div className="flex justify-center py-2">
          <div className="relative h-40 w-40">
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(#2f7f68_0deg_258deg,#d2a03a_258deg_316deg,#c76a63_316deg_360deg)]" />
            <div className="absolute inset-[26px] rounded-full bg-white" />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-mint/15 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-black">半導體</p>
              <p className="mt-1 text-xs text-black/45">目前選取扇區明細</p>
            </div>
            <span className="rounded-full bg-[#eaf4ee] px-3 py-1.5 text-sm font-bold tabular-nums text-[#2f7f68]">71.57%</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#fcfbf7] px-3 py-3">
              <p className="text-[11px] text-black/45">持股市值</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-black">$188,400</p>
            </div>
            <div className="rounded-xl bg-[#fcfbf7] px-3 py-3">
              <p className="text-[11px] text-black/45">持股檔數</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-black">1 檔</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <LegendRow color="#2f7f68" label="半導體" amount="$188,400" ratio="71.57%" />
          <LegendRow color="#d2a03a" label="ETF" amount="$42,160" ratio="16.02%" />
          <LegendRow color="#c76a63" label="電腦及週邊設備業" amount="$32,670" ratio="12.41%" />
        </div>
      </div>
    </Section>
  );
}

export default function MobileUiFixesMockPage() {
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-4 py-6 text-[#111111]">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#2f7f68]">Stock Ledger</p>
          <h1 className="mt-1 text-2xl font-bold">手機 UI 修正示意</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">這頁只示意三個 A 方案：帳本卡、首頁說明、分析圓餅圖。確認後再套進正式頁面。</p>
        </header>
        <PortfolioCardMock />
        <PortfolioCardMockB />
        <InfoTipMock />
        <InfoTipMockB />
        <AnalyticsPieMock />
        <AnalyticsPieMockB />
      </div>
    </main>
  );
}
