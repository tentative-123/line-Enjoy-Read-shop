# Enjoy Read 無人咖啡廳架構

## 現況

本專案是 LINE Harness monorepo：Worker 以 Hono 提供 API、Webhook、LIFF 靜態頁與排程；
Next.js 管理後台透過 Worker API 操作 D1；既有 `friends`、`line_accounts`、訊息、提醒、
一般預約與活動預約皆保留。新功能不改寫既有 `menus`、`staff`、`staff_shifts` 或
`bookings`，而是建立獨立的 cafe domain。

## 修改策略

1. 以 additive migration 建立據點、空間、座位、營業時間、封鎖、預約、allocation、
   booking event、idempotency、QR credential、gate device、access event、通知工作與稽核資料。
2. Worker 的 cafe service 集中處理 UTC 時間、半開區間重疊、容量、取消與 allocation；
   route 只負責驗證輸入、session ownership 與一致的 API envelope。
3. `capacity_pool` 也使用隱藏 unit。建立 hold 時以每個時間格的 allocation 唯一索引及
   `INSERT ... ON CONFLICT DO NOTHING` 競爭座位；未取得足夠 allocation 時回滾該次 request，
   因此兩位顧客不能同時取得最後一席。
4. LIFF 只送 LINE ID token。Worker 向 LINE verify endpoint 驗證 audience/subject，再簽發
   短效 HttpOnly cafe session；friend 與 booking owner 永遠由 session 推導。
5. 管理後台沿用既有 admin cookie / RBAC；所有變更寫入 `cafe_audit_logs`。
6. QR 使用 HMAC-SHA256 短效 token，DB 只留 token hash 與 jti。Gate device key 同樣只留 hash；
   `MockGateProvider` 僅可在明確開啟 mock mode 時使用。

## 資料流

```text
LINE Rich Menu -> LIFF -> POST /api/liff/session (LINE verify)
                         -> cafe session cookie
LIFF -> availability -> D1 opening hours / blackouts / active allocations
LIFF -> hold/create  -> idempotency -> conditional allocations -> booking event
                                      -> LINE confirmation / reminder jobs
QR scan -> device auth -> signature/time/revocation/ownership checks
        -> MockGateProvider -> access event -> allow/deny
Admin -> existing admin auth/RBAC -> cafe admin API -> audit log
```

## 時間與安全邊界

- 持久化時間為 UTC ISO 8601；UI 以 `Asia/Taipei` 顯示。
- 重疊定義固定為 `existingStart < requestedEnd && existingEnd > requestedStart`。
- `holding`（未逾期）、`pending_payment`、`confirmed`、`checked_in` 占容量。
- Session、QR 與 device secrets 只由 Wrangler secret 注入，不寫入 Git 或 log。
- 第一階段沒有真實金流或門禁廠商；provider interface 是後續替換邊界。
