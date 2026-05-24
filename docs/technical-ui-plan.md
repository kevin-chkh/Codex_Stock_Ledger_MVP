# 股票交易帳本技術與 UI 計畫

## 技術路線

- Frontend: Next.js App Router + TypeScript。
- Styling: Tailwind CSS。
- Data/Auth: Supabase Auth + Supabase Postgres + Row Level Security。
- Local mode: 未設定 Supabase 時使用 localStorage，支援本機持久化與 JSON 備份/還原。
- Charts: Recharts。
- Validation: Zod。
- Tests: Vitest。
- Hosting: Vercel。

## MVP 資料策略

- `positions` 不直接存表，由 `trades + stocks + stock_tags` 計算。
- 第一版採平均成本法。
- 現金餘額存在 `portfolios.cash_balance`，交易新增、編輯、刪除時同步調整。
- 買入會增加持股成本並減少現金。
- 賣出會檢查可賣股數，計算已實現損益並增加現金。
- 未實現損益由手動更新目前價格後重新計算。
- 股票目錄採 TWSE + TPEx API，失敗時使用 localStorage cache，再失敗時使用 fallback。
- Header 可手動重新載入股票目錄，並顯示來源與結果。

## 手機 UI 原則

- 第一屏優先呈現總資產、總損益、總報酬率。
- 底部五分頁：總覽、帳本、交易、持股、分析。
- 新增動作用 FAB 開啟 actionsheet：買入、賣出、資金異動。
- 表單使用 bottom sheet，重要欄位優先，費用與試算靠近送出前。
- 手機列表以卡片呈現，桌面維持最大寬度容器。
- 底部導覽與 FAB 使用 safe area，避免被手機瀏覽器工具列遮擋。

## 已完成

- 多帳本與資金異動。
- 買入 / 賣出交易新增、編輯、刪除。
- Dashboard 全部帳本 / 單一帳本篩選。
- 持股成本、平均成本、已實現與未實現損益。
- 股票代號 / 名稱自動帶入與模糊搜尋。
- TWSE + TPEx 股票目錄、cache、fallback。
- 持股頁搜尋、產業篩選、標籤篩選、排序。
- 交易頁搜尋、篩選、排序、CSV 匯出。
- 分析頁產業分布、標籤分布、損益排行。
- localStorage 本機持久化。
- JSON 備份 / 還原。
- 全域訊息列與主要操作成功回饋。
- 股票目錄手動重新載入。
- 共用 UI 元件拆分到 `src/components/stock-ledger/ui.tsx`。
- Dashboard 拆分到 `src/components/stock-ledger/dashboard.tsx`。
- 交易現金回算與賣超防呆集中到 `src/lib/trade-ledger.ts`，並補整合測試。

## 下一步

- 補更多 UI 空狀態與錯誤狀態。
- 補手動 QA：375px、390px、430px 與手機實機。
- 繼續拆分 `Trades`、`Holdings`、`Analytics`、表單元件，降低主元件體積。
- 補交易編輯 / 刪除的元件測試。
- 部署到 Vercel 並接正式 Supabase 專案。

## 目前不做

- 即時股價串接。
- 原生 App。
- 多市場交易規則。
- 複雜報表與稅務申報。
- 自動券商匯入。
