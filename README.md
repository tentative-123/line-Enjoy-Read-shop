# Enjoy Read 無人咖啡廳預約系統

Enjoy Read 是以 **LINE 官方帳號與 LIFF** 為入口的無人咖啡廳／無人讀書空間預約系統。本專案由 LINE Harness 衍生，保留原有好友管理、訊息、Rich Menu、提醒與 CRM 能力，並新增獨立的 cafe domain，避免和原本的 staff booking 混在一起。

## 現有功能

### 顧客 LIFF

- 使用 LINE ID Token 向後端換取短效 cafe session，不信任瀏覽器自行提交的 LINE User ID 或 friend ID。
- 查看據點、空間、營業時間與即時剩餘座位。
- 支援共用容量區 `capacity_pool` 與指定單位區 `assigned_unit`。
- 選擇日期、時間、使用時數、人數與聯絡資料後建立預約。
- 使用 `Idempotency-Key` 避免重複送出產生兩筆預約。
- 查看「我的預約」及在期限內取消。
- LIFF 採行動優先介面，包含深色品牌首頁、日期／空間卡片、即時座位儀表、三步驟預約、確認票券、完成頁與帳戶側欄。

本機可直接開啟 UI 預覽，不需要真的登入 LINE：

```text
http://localhost:5173/?page=cafe&liffId=preview&cafePreview=1
```

`cafePreview=1` 只在 Vite development mode 生效，production 仍必須完成 LINE ID Token 驗證。

### 管理後台

- Enjoy Read 營運數字與近期進場名單。
- 預約紀錄、顧客、付款與入場狀態查詢。
- 據點與空間規則總覽。

### 資料與門禁基礎

- 據點、空間、座位、營業時間、blackout、預約、allocation 與事件紀錄。
- QR credential、gate device、access event 與 audit log schema。
- 可替換的 `GateProvider` 與僅供測試的 `MockGateProvider`。
- 第一版未串接真實金流或真實門禁廠商。

## 技術架構

```text
LINE / LIFF
    │
    ▼
Railway Backend + LIFF（Hono Worker，由 Wrangler compatibility runtime 執行）
    │
    ├── 本地 D1 相容 SQLite（Railway Volume /data）
    └── 本地 R2 相容儲存（Railway Volume /data）

Railway Admin（Next.js 靜態輸出 + nginx）
    │
    └── HTTPS 呼叫 Backend API
```

主要套件：

- Node.js 22
- pnpm workspace
- Hono、Cloudflare Worker APIs、D1 相容 SQLite
- Next.js 15、React 19、Tailwind CSS
- TypeScript、Vitest

> Railway 並不原生提供 Cloudflare D1/R2。Backend image 以 Wrangler local compatibility runtime 執行既有 Worker，並把 SQLite/R2 狀態放在 Railway Volume。這讓目前程式不必全面重寫即可部署，但正式高流量環境仍建議後續將 persistence adapter 改為 PostgreSQL／S3，或把 Worker 保留在 Cloudflare。

## 本機開發

### 需求

- Node.js 20 以上，建議 Node.js 22
- pnpm 9.15.4

### 安裝與啟動

```bash
pnpm install
pnpm --filter @line-crm/shared build
pnpm --filter @line-harness/update-engine build
pnpm dev:worker
```

另一個終端啟動管理後台：

```bash
NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm dev:web
```

### 建立本地資料庫

首次使用可執行：

```bash
pnpm --filter worker exec wrangler d1 execute line-harness \
  --local --file=packages/db/bootstrap.sql
pnpm --filter worker exec wrangler d1 execute line-harness \
  --local --file=packages/db/migrations/050_unmanned_cafe.sql
```

匯入 cafe seed 前，先將 `packages/db/seeds/unmanned-cafe.local.sql` 裡的 `dev-line-account` 改成現有的 `line_accounts.id`：

```bash
pnpm --filter worker exec wrangler d1 execute line-harness \
  --local --file=packages/db/seeds/unmanned-cafe.local.sql
```

Seed 只供 local development，系統不會自動匯入 production。

## 部署到 Railway

本 repository 使用 **兩個 Railway Service**：

1. `enjoy-read-api`：Backend API 與 LIFF，使用根目錄 `Dockerfile`。
2. `enjoy-read-admin`：管理後台，使用 `Dockerfile.web`。

不要把兩個 service 合併成同一個 port；這樣 API 與後台可以分別設定健康檢查、domain 與重新部署。

### 1. 建立 Backend Service

1. 在 Railway 建立 Project，從此 GitHub repository 新增第一個 service。
2. Service 的 config file 使用 `/railway.toml`；它會採用根目錄 `Dockerfile`。
3. 建立 Railway Volume 並掛載至 **`/data`**。沒有 Volume 時資料會在重新部署後消失。
4. 產生 Railway public domain，例如 `https://enjoy-read-api.up.railway.app`。
5. 設定以下 variables：

```dotenv
API_KEY=請使用長度至少32字元的隨機值
LINE_CHANNEL_ID=LINE_Messaging_API_Channel_ID
LINE_CHANNEL_ACCESS_TOKEN=LINE_Messaging_API_Channel_Access_Token
LINE_CHANNEL_SECRET=LINE_Messaging_API_Channel_Secret
LINE_LOGIN_CHANNEL_ID=LINE_Login_Channel_ID
LINE_LOGIN_CHANNEL_SECRET=LINE_Login_Channel_Secret
LIFF_URL=https://liff.line.me/你的LIFF_ID
WORKER_URL=https://enjoy-read-api.up.railway.app
ADMIN_ORIGIN=https://enjoy-read-admin.up.railway.app
ADMIN_ALLOW_CROSS_SITE=true
CAFE_SESSION_SECRET=請使用另一組至少32字元的隨機值
QR_SIGNING_SECRET=請使用另一組至少32字元的隨機值
GATE_DEVICE_SECRET=請使用另一組至少32字元的隨機值
CAFE_MOCK_GATE=false
```

Railway 會自動提供 `PORT`，請勿自行固定。Container 啟動時會：

- 將 allow-list 中的 Railway variables 安全地寫入 runtime `.dev.vars`。
- 在空白 Volume 套用 `bootstrap.sql` 與 migration `050_unmanned_cafe.sql`。
- 只有 migration 完成後才寫入初始化 marker。
- 監聽 `0.0.0.0:$PORT`。
- 以 `/api/health` 作為 health check。

### 2. 建立 Admin Service

1. 從相同 repository 新增第二個 service。
2. 將 Railway config file 設為 `/railway.web.toml`；它會採用 `Dockerfile.web`。
3. 加入 build/runtime variable：

```dotenv
NEXT_PUBLIC_API_URL=https://enjoy-read-api.up.railway.app
```

4. 產生 public domain，例如 `https://enjoy-read-admin.up.railway.app`。
5. 回到 Backend，確認 `ADMIN_ORIGIN` 正好等於 Admin HTTPS origin，不能加尾端 `/`。
6. 重新部署 Backend，讓 credentialed CORS allow-list 生效。

Admin service 是靜態輸出，不需要 Volume。健康檢查路徑為 `/healthz`。

### 3. 設定 LINE Login 與 LIFF

在 LINE Developers Console：

1. LINE Login channel 的 Web app callback/domain 加入 Backend Railway domain。
2. 建立 LIFF app，Endpoint URL 設成：

```text
https://enjoy-read-api.up.railway.app/?page=cafe&liffId=你的LIFF_ID
```

3. Scope 至少啟用 `openid` 與 `profile`。
4. 將 LIFF ID 存入對應 `line_accounts.liff_id`。
5. Rich Menu 的「立即預約」使用 LIFF URL：

```text
https://liff.line.me/你的LIFF_ID?page=cafe&liffId=你的LIFF_ID
```

### 4. 第一次部署檢查

```bash
curl https://enjoy-read-api.up.railway.app/api/health
curl -I https://enjoy-read-admin.up.railway.app/healthz
```

預期 Backend 回傳：

```json
{"success":true,"data":{"status":"ok"}}
```

接著依序檢查：

1. Admin 可以登入。
2. LIFF 可以完成 LINE Login。
3. `/api/cafe/venues` 有 seed 或自行建立的據點。
4. 建立一筆測試預約並從「我的預約」讀回。
5. Railway 重新部署 Backend 後，測試預約仍存在；若消失，代表 Volume 未掛載到 `/data`。

## Railway 資料備份與限制

- `/data` 必須使用 Railway Volume；SQLite 不適合多個 Backend replica 同時寫入。
- Backend service 的 replica 數量請維持 **1**，否則不同 instance 可能看見不同檔案或產生寫入競爭。
- 部署前應先做 Volume snapshot／備份。
- migration marker 位於 `/data/.line-harness-initialized`。不要手動刪除，除非確定要重建空白資料庫。
- 新增 migration 時，不能只修改初始化腳本；需要提供可重複執行的 upgrade command 或正式 migration runner。
- Mock Gate 必須在 production 保持 `CAFE_MOCK_GATE=false`。
- 正式 QR 簽章、真實門禁與真實付款仍未完成，不應對外宣稱已串接。

## 測試與建置

```bash
pnpm install
pnpm --filter worker typecheck
pnpm --filter worker test
pnpm --filter web test
NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm build

docker build -t enjoy-read-api .
docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8787 \
  -f Dockerfile.web -t enjoy-read-admin .
```

## 文件

- [無人咖啡廳架構](docs/UNMANNED_CAFE_ARCHITECTURE.md)
- [本機設定](docs/UNMANNED_CAFE_SETUP.md)
- [Gate Provider 與 Mock Gate](docs/GATE_INTEGRATION.md)

## 尚未完成

- Stripe、LINE Pay 或其他正式金流。
- 正式 QR credential 簽發、撤銷與完整掃描驗證。
- 真實門禁廠商 adapter。
- Production secrets 與正式 deployment 操作。
- PostgreSQL／S3 等 Railway-native persistence adapter。

## 授權

沿用原 LINE Harness 的 MIT License。
