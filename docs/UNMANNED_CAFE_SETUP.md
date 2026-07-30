# Enjoy Read 本機設定

Railway production 部署請以根目錄繁體中文 [README](../README.md#部署到-railway) 為準；
本文件保留本機 D1、LINE Login 與功能測試步驟。

## 啟動與 D1

```bash
pnpm install
pnpm --filter worker exec wrangler d1 execute line-harness --local --file=packages/db/migrations/050_unmanned_cafe.sql
# 先把 seed 內 dev-line-account 改為本地現有 line_accounts.id
pnpm --filter worker exec wrangler d1 execute line-harness --local --file=packages/db/seeds/unmanned-cafe.local.sql
pnpm dev:worker
pnpm dev:web
```

Seed 只供 local development，不會由 Worker 或 production migration 自動匯入。

## LINE Login、LIFF 與 Rich Menu

1. 在 LINE Developers 建立 LINE Login channel，LIFF endpoint 指向 Worker URL 並加上
   `?page=cafe&liffId=<LIFF_ID>`。
2. 將 Login channel ID 與 LIFF ID 寫入既有 LINE account 設定。
3. Rich Menu「立即預約」action 使用上述 LIFF URL。
4. Worker 會用 ID token 呼叫 LINE verify；瀏覽器傳來的 user id、friend id、姓名不作為 owner 身分。

## 測試預約

開啟 LIFF → 即時空位 → 選日期、空間、開始時間、時數、人數 → 填姓名手機與同意條款 →
送出。成功後可從「我的預約」查看或在取消期限前取消；後台 `/cafe/bookings` 可查詢紀錄。

## 尚未連接

第一版的付款狀態與 provider boundary 已保留，但沒有 Stripe 或 LINE Pay。正式 QR 簽章與真實
門禁也尚未啟用；production 不應開啟 `CAFE_MOCK_GATE`。
