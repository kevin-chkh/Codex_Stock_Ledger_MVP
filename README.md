# Stock Ledger MVP

手機優先的台股交易記帳網頁，用來記錄帳本現金、買賣交易、持股成本、已實現與未實現損益。

## Tech Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth + Postgres + RLS
- Recharts
- Vitest

## Local Development

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。

如果沒有設定 Supabase 環境變數，系統會使用本機資料模式。第一次開啟會載入 demo 資料，之後新增、編輯與刪除的資料會保存在瀏覽器 localStorage。

## Supabase Setup

1. 建立 Supabase project。
2. 到 Supabase SQL Editor 執行 `supabase/schema.sql`。
3. 複製 `.env.example` 為 `.env.local`。
4. 填入：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

5. 在 Supabase Auth 啟用 Email OTP / magic link。

## Current MVP Scope

- 多帳本與資金異動。
- 未設定 Supabase 時支援 localStorage 本機持久化。
- 買入 / 賣出交易記錄，可編輯、刪除、搜尋、篩選、排序與匯出 CSV。
- JSON 備份 / 還原，可完整匯出或匯入本機資料。
- Dashboard 與共用 UI 元件已拆分，交易現金回算邏輯集中在 `src/lib/trade-ledger.ts`。
- 台股手續費與交易稅試算。
- 平均成本法持股計算。
- Dashboard：總資產、現金、持股市值、已實現 / 未實現損益、報酬率，支援全部帳本 / 單一帳本篩選。
- 持股排行：市值、占比、損益、報酬率。
- 持股頁可依代號、名稱、產業別、標籤搜尋，並依市值、報酬率、損益、代號排序。
- 股票代號 / 名稱自動帶入，支援 TWSE + TPEx 目錄、快取與 fallback。
- 股票目錄可從 header 手動重新載入，並顯示目前來源。
- 股票產業別與分類標籤。
- 分析頁：產業分布、標籤分布、損益排行、股票占比。
- 分析頁可依分類標籤篩選。
- 交易編輯時會檢查賣出股數不可超過持股，刪除交易會同步回復帳本現金。
- 設定頁可匯出 JSON、匯入 JSON、重置成本機 demo。
- 主要操作完成後會顯示狀態訊息，可手動關閉。

## Test

```bash
npm run test
npm run build
```

目前測試涵蓋交易金額、手續費、交易稅、平均成本、已實現損益、未實現損益、股票查詢 fallback，以及交易新增 / 編輯 / 刪除的現金回算與賣超防呆。

## Manual QA Checklist

- 手機寬度 375px、390px、430px 下，底部導航與 FAB 不遮住主要操作。
- Dashboard 第一屏可看到總資產、總損益、總報酬率。
- 新增買入交易後，現金下降、持股增加、平均成本正確。
- 新增賣出交易後，現金增加、可賣股數檢查正確、已實現損益正確。
- 編輯交易後，Dashboard 與持股頁數字同步更新。
- 刪除交易後，帳本現金回復，持股與損益同步更新。
- Dashboard 可切換全部帳本與單一帳本。
- 重新整理頁面後，本機資料仍會保留。
- 持股頁篩選與排序可正常更新列表。
- 設定頁匯出 JSON 後，可重新匯入並還原資料。
- 點擊 header 的重新載入按鈕後，股票目錄來源與載入結果會顯示在訊息列。
- 輸入股票代號或名稱時，能出現模糊提示並帶入名稱、代號與產業別。
- 更新持股現價後，Dashboard 與持股頁的未實現損益同步更新。
- 交易頁搜尋、篩選、排序與 CSV 匯出可正常使用。
- 分析頁可依分類標籤篩選圖表與排行。
