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

## 部署到 Railway（第一次使用完整教學）

以下步驟假設你第一次使用 Railway。先不要一次處理所有 LINE 設定；我們會先讓 Backend 顯示綠色 `Online`，再建立管理後台。

### 先了解：一個 Project 裡要有兩個 Service

- **Enjoy Read API**：Backend API、LIFF 與 SQLite，相當於系統主機。使用 `Dockerfile`。
- **Enjoy Read Admin**：管理後台。使用 `Dockerfile.web`。

你截圖中的 `Enjoy Read` 是第一個 Backend Service。畫面顯示 Build 與 Deploy 已完成、失敗點是 `Network › Healthcheck`。舊版啟動方式會先執行資料庫初始化，Railway 在這段時間找不到 `$PORT`，所以判定 healthcheck failure。現在的啟動器會先監聽 `$PORT` 並回報 `initializing`，再建立資料庫；修正後 health check 改用 `/healthz` 並允許 300 秒。

### 第 0 步：確認 GitHub 已經有最新修正

在 Railway 點開 `Enjoy Read` Service → `Settings` → `Source`，確認：

1. Repository 是這個 Enjoy Read repository。
2. Branch 是包含最新程式碼的 branch。
3. 最新 commit 至少包含 Railway health fix。
4. Root Directory 保持 `/` 或空白，不要設成 `apps/worker`。

如果 Railway 還停在舊 commit，請先 push 最新 branch，再按 `Deployments` → `Redeploy`。

### 第 1 步：設定 Backend Service

如果你已經有截圖中的 `Enjoy Read` Service，不需要刪掉，直接沿用。

1. 點 `Enjoy Read` Service。
2. 進入 `Settings`。
3. 找到 **Config as Code**／Railway Config File。
4. 填入：

```text
/railway.toml
```

5. 確認 Builder 使用 Dockerfile；設定檔會自動指定根目錄 `Dockerfile`。
6. 不要自行設定固定 Port。Railway 會提供 `$PORT`，啟動器會自動使用。
7. Healthcheck Path 應顯示 `/healthz`；Timeout 應為 `300` 秒。
8. Start Command 應顯示 `node scripts/railway-server.mjs`。這項設定會明確覆蓋舊 deployment 的啟動指令。

### 第 2 步：建立 Volume（一定要做）

SQLite 必須放在持久化磁碟，否則每次重新部署資料都會消失。

1. 回到 Project 畫布。
2. 按 `New` 或右鍵空白區。
3. 選擇 `Volume`。
4. 將 Volume 連接到 `Enjoy Read` Backend Service。
5. Mount Path 輸入：

```text
/data
```

6. 儲存。

只建立 Volume 但沒有填 `/data` 不算完成。Backend replica 數量也必須維持 `1`。

### 第 3 步：先加入最小測試 Variables

進入 `Enjoy Read` → `Variables`，按 `New Variable` 或使用 Raw Editor。正式上線前要換成真正的 LINE 資料，但第一次測試部署可以先加入下列值：

```dotenv
API_KEY=請放至少32字元的隨機字串
LINE_CHANNEL_ID=temporary-channel-id
LINE_CHANNEL_ACCESS_TOKEN=temporary-access-token
LINE_CHANNEL_SECRET=temporary-channel-secret
LINE_LOGIN_CHANNEL_ID=temporary-login-channel-id
LINE_LOGIN_CHANNEL_SECRET=temporary-login-secret
LIFF_URL=https://example.com
WORKER_URL=https://example.com
ADMIN_ORIGIN=https://example.com
ADMIN_ALLOW_CROSS_SITE=true
CAFE_SESSION_SECRET=請放另一組至少32字元的隨機字串
QR_SIGNING_SECRET=請放另一組至少32字元的隨機字串
GATE_DEVICE_SECRET=請放另一組至少32字元的隨機字串
CAFE_MOCK_GATE=false
```

可以在自己電腦產生 secret：

```bash
openssl rand -hex 32
```

每一組 secret 都應該不同。不要把真正 secret 貼到 GitHub、Issue 或聊天截圖。

### 第 4 步：重新部署 Backend

1. 進入 `Deployments`。
2. 點最新 deployment 右側 `⋮`。
3. 選 `Redeploy`；如果有 `Deploy Latest Commit`，優先使用它。
4. 點 `View logs`。

正常第一次啟動會依序看到：

```text
[railway] Railway health server 已監聽 0.0.0.0:xxxx
[railway] 偵測到新的 Volume，開始建立資料庫
[railway] 資料庫初始化完成
[railway] Enjoy Read 已就緒
```

Health check 在初始化期間會收到：

```json
{"success":true,"data":{"status":"initializing","phase":"database-bootstrap"}}
```

Worker 完成後會變成：

```json
{"success":true,"data":{"status":"ok","phase":"ready"}}
```

### 第 5 步：產生 Backend 公開網址

部署變成綠色 `Online` 後：

1. 進入 Backend `Settings`。
2. 找到 `Networking`／`Public Networking`。
3. 點 `Generate Domain`。
4. 記下網址，例如：

```text
https://enjoy-read-api-production.up.railway.app
```

5. 回到 `Variables`，修改：

```dotenv
WORKER_URL=https://enjoy-read-api-production.up.railway.app
```

6. 儲存後 Railway 會重新部署。
7. 用瀏覽器開啟：

```text
https://enjoy-read-api-production.up.railway.app/healthz
```

看到 `status: ok` 就表示 Backend 網路已成功。

### 第 6 步：建立 Admin Service

回到同一個 Railway Project：

1. 按 `New` → `GitHub Repo`。
2. 再選一次同一個 repository。
3. 將新 Service 命名為 `Enjoy Read Admin`。
4. 進入 Admin `Settings` → Config File，填入：

```text
/railway.web.toml
```

5. 進入 Admin `Variables`，加入：

```dotenv
NEXT_PUBLIC_API_URL=https://你的Backend網址.up.railway.app
```

6. 重新部署 Admin。
7. 部署成功後到 `Settings` → `Networking` → `Generate Domain`。
8. 記下 Admin 網址，例如：

```text
https://enjoy-read-admin-production.up.railway.app
```

Admin 不需要 Volume，健康檢查路徑是 `/healthz`。

### 第 7 步：讓 Admin 可以呼叫 Backend

回到 Backend Service 的 `Variables`，把以下值換成真正的 Admin 網址，不能在最後加 `/`：

```dotenv
ADMIN_ORIGIN=https://enjoy-read-admin-production.up.railway.app
ADMIN_ALLOW_CROSS_SITE=true
```

儲存並重新部署 Backend，否則瀏覽器會因 CORS／Cookie 規則擋住登入。

#### Admin 顯示「無法連線至後端」

這個訊息代表瀏覽器尚未取得 Backend 的 HTTP 回應，通常是 Backend 網址、DNS 或 CORS
設定錯誤，**不是 API Key 錯誤**。請依序檢查：

1. Admin 的 `NEXT_PUBLIC_API_URL` 必須是可公開存取且包含 `https://` 的 Backend Domain，不能使用
   `*.railway.internal`、`127.0.0.1` 或 `0.0.0.0`。
2. 直接開啟 `${NEXT_PUBLIC_API_URL}/healthz`，必須看到 `status: ok`。
3. Backend 的 `ADMIN_ORIGIN` 必須完全等於 Admin Origin，例如
   `https://enjoy-read-admin-production.up.railway.app`，結尾不可加路徑。
4. Backend 設定 `ADMIN_ALLOW_CROSS_SITE=true`，然後重新部署 Backend。
5. 修改 `NEXT_PUBLIC_API_URL` 後必須重新 **Build／Redeploy Admin**；只 Restart 不會更新已編譯進
   JavaScript 的網址。

只有畫面顯示「API Key 不正確」（HTTP 401）時，才需要檢查 Backend 的 `API_KEY`。

### 第 8 步：換成真正 LINE Variables

到 LINE Developers Console 取得並替換 Backend Variables：

```dotenv
LINE_CHANNEL_ID=Messaging API Channel ID
LINE_CHANNEL_ACCESS_TOKEN=Messaging API Channel Access Token
LINE_CHANNEL_SECRET=Messaging API Channel Secret
LINE_LOGIN_CHANNEL_ID=LINE Login Channel ID
LINE_LOGIN_CHANNEL_SECRET=LINE Login Channel Secret
LIFF_URL=https://liff.line.me/你的LIFF_ID
WORKER_URL=https://你的Backend網址.up.railway.app
```

LINE Login 與 Messaging API 是不同 channel 時，不要把兩組 Channel ID／Secret 混在一起。

### 第 9 步：設定 LIFF

在 LINE Developers Console 的 LINE Login Channel：

1. 開啟 `LIFF` 分頁。
2. 新增 LIFF App。
3. Size 建議選 `Full`。
4. Endpoint URL：

```text
https://你的Backend網址.up.railway.app/?page=cafe&liffId=你的LIFF_ID
```

5. Scope 開啟 `openid` 與 `profile`。
6. 儲存後取得 LIFF ID。
7. 將 LIFF ID 寫入系統對應的 `line_accounts.liff_id`。
8. Rich Menu 的「立即預約」連結使用：

```text
https://liff.line.me/你的LIFF_ID?page=cafe&liffId=你的LIFF_ID
```

### 第 10 步：完成部署驗收

請依序檢查：

```bash
curl https://你的Backend網址.up.railway.app/healthz
curl https://你的Backend網址.up.railway.app/api/health
curl -I https://你的Admin網址.up.railway.app/healthz
```

然後實際操作：

1. Admin 網址可以開啟。
2. LIFF 可以完成 LINE Login。
3. `/api/cafe/venues` 可以回傳據點。
4. 建立測試預約。
5. 從「我的預約」讀回同一筆預約。
6. 手動 Redeploy Backend。
7. Redeploy 後預約仍存在，確認 `/data` Volume 正常。

### 看到 Healthcheck failure 時怎麼處理

依序檢查，不要直接刪掉 Project：

1. `Deployments` → 失敗項目 → `View logs`。
2. 搜尋 `[railway] 啟動失敗`、`ERROR` 或 `permission denied`。
3. 如果完全沒有 `[railway] Railway health server 已監聽`：確認使用最新 commit、根目錄 `Dockerfile`、Config File `/railway.toml`。
4. 如果顯示 `/data` permission error：刪除錯誤 Volume 後重新建立，Mount Path 必須是 `/data`。
5. 如果顯示 `dist/client does not exist`：代表 Docker build 沒有使用根目錄 `Dockerfile`，通常是 Root Directory 被錯設成 `apps/worker`。
6. 如果一直停在 database bootstrap：確認 Volume 空間足夠，並把完整 Deploy Log 保存下來。
7. 如果 Backend 已 `Online` 但 Admin 登入失敗：檢查 `ADMIN_ORIGIN` 是否完全等於 Admin HTTPS origin。
8. 如果修改 Variable 後仍是舊結果：按 `Deploy Latest Commit`，不要只 Restart 舊 deployment。

若仍然失敗，請提供 `View logs` 裡從第一行到錯誤行的文字；只有 `Healthcheck failure` 截圖看不到實際 process error。

你上一則貼的是 **Build Logs**；它只能證明 Docker image 建立成功。這次需要的是 Service 的 **Deploy Logs／Runtime Logs**，內容應包含 `[railway]` 開頭的訊息。如果完全沒有 `[railway]`，通常表示 Railway 還在執行舊 image 或舊 Start Command。

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
