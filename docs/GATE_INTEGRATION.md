# Enjoy Read Gate 整合

## 安全模型

QR payload 僅允許 version、credential/jti、iat、nbf、exp、aud=`enjoy-read-gate`，不可放姓名、
手機、LINE ID 或永久密碼。Token 以 `QR_SIGNING_SECRET` 簽章，D1 只保存 SHA-256 hash 與 jti；
device key 亦只保存 hash。每次掃描都應寫入 `access_events`，包含 allow/deny reason，不記錄 token。

## Mock Gate

本機 `.dev.vars` 設 `CAFE_MOCK_GATE=true`，建立 `gate_devices`（把測試 key 的 SHA-256 hash 寫入
`device_key_hash`），呼叫：

```bash
curl -X POST http://localhost:8787/api/gate/v1/scan \
  -H 'Content-Type: application/json' -H 'X-Gate-Device-Key: local-test-key' \
  -d '{"deviceCode":"MAIN_GATE_01","qrToken":"mock-token"}'
```

Mock 回應只證明 provider boundary 可運作，不代表真實門鎖已串接。Production 必須關閉 mock。

## 替換廠商

實作 `GateProvider.unlock()`，在通過 device、簽章、audience、時間、撤銷、booking 狀態、據點與
使用次數檢查後呼叫即可。這個 adapter 可連 HTTP API、IoT relay、MQTT gateway 或門禁廠商 API；
provider reference 寫進 access event metadata，secret 只用 Wrangler secret 注入。
