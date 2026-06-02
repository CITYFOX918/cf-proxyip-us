# ProxyIP US IPv4

Cloudflare Worker + DNS-only ProxyIP 專案：`list.leilaomi.cc.cd` 分發資料；`proxyip.leilaomi.cc.cd` 只解析到 1 個低風險且穩定的主 ProxyIP。當前主 IP 仍有效時不切換，連續失效後才 failover。

## 線上地址

- ProxyIP 域名（DNS-only 單 A 記錄）：`proxyip.leilaomi.cc.cd`
- Worker 入口頁：https://list.leilaomi.cc.cd/
- 當前主 ProxyIP：https://list.leilaomi.cc.cd/current.txt
- 當前主 ProxyIP 詳情：https://list.leilaomi.cc.cd/current.json
- 備用候選：https://list.leilaomi.cc.cd/standby.txt
- 推薦 Top 5（當前 + 備用，不直接全量寫入 DNS）：https://list.leilaomi.cc.cd/top5.txt
- 全量列表：https://list.leilaomi.cc.cd/all.txt
- US 列表：https://list.leilaomi.cc.cd/us.txt
- Top 20：https://list.leilaomi.cc.cd/best.txt
- 完整報告：https://list.leilaomi.cc.cd/full.json
- V2Ray Base64：https://list.leilaomi.cc.cd/v2ray.txt
- HMAC Token：https://list.leilaomi.cc.cd/token
- 健康檢查：https://list.leilaomi.cc.cd/health
- 統計數據：https://list.leilaomi.cc.cd/stats

## 認證方式

數據接口需要認證，支援兩種方式：

### 1. Cookie 認證（瀏覽器）
訪問首頁自動設置 `proxyip_access=ok` cookie，有效期 8 小時。

### 2. HMAC Token 認證（程式化訪問）
```bash
# 1. 先訪問首頁獲取 cookie
curl -c cookies.txt https://list.leilaomi.cc.cd/

# 2. 用 cookie 訪問 /token 獲取 HMAC token
curl -b cookies.txt https://list.leilaomi.cc.cd/token
# 返回: {"token":"20260531-abc123...","date":"20260531","mode":"hmac"}

# 3. 用 HMAC token 訪問數據接口
curl "https://list.leilaomi.cc.cd/all.txt?t=20260531-abc123..."
```

Token 格式：`YYYYMMDD-HMAC-SHA256-Hex`，每天自動更新。

### 3. ETag 緩存
所有數據接口支援 ETag/304 緩存，客戶端可通過 `If-None-Match` 頭部減少頻寬消耗。

## 當前實際數據

當前數據以線上 `/health`、`docs/current.txt`、`docs/full.json` 為準。候選數、有效 IP 數、延遲與 Top 5 會隨每次自動巡檢變化，README 不再寫死動態數字。

快速查看：

```bash
curl https://list.leilaomi.cc.cd/health
cat docs/current.txt
python3 - <<'PY'
import json
from pathlib import Path
full = json.loads(Path("docs/full.json").read_text())
print(full["summary"])
PY
```

輸出文件在 `docs/`：

- `docs/current.txt`：1 個當前穩定主 IP，用於 `proxyip.leilaomi.cc.cd` DNS-only 單 A 記錄
- `docs/current.json`：當前主 IP 詳情與狀態
- `docs/state.json`：failover 狀態、連續失敗次數、最近成功時間
- `docs/history.json`：切換歷史
- `docs/standby.txt`：備用候選池
- `docs/top5.txt`：當前主 IP + 前 4 個備用候選
- `docs/all.txt`：通過 IPv4 與目標地區檢測的 IP
- `docs/us.txt`：目前等同 `docs/all.txt`
- `docs/best.txt`：前 20 個
- `docs/dns-records.json`：Cloudflare DNS A 記錄快照
- `docs/full.json`：公開檢測報告（不包含完整 debug `all_results`）
- `docs/v2ray.txt`：Base64 編碼的純 IP 列表；不是完整 V2Ray/VLESS 節點訂閱

## Cloudflare 部署

- Worker name：`cf-proxyip-us`
- Worker 自定義域名：`list.leilaomi.cc.cd`
- ProxyIP DNS-only 域名：`proxyip.leilaomi.cc.cd`，1 條 A 記錄、灰雲、不經 Cloudflare 代理
- 主域 `leilaomi.cc.cd` **不綁定**此 Worker；實測不命中本 Worker
- `workers.dev` 與 preview URL 已在配置中關閉，不作為對外地址；實測 `cf-proxyip-us.horjane.workers.dev` 返回 404/1042

配置見 `file wrangler.toml`。Worker 自定義域名在 Cloudflare Workers Custom Domains 中綁定到 `list.leilaomi.cc.cd`；`proxyip.leilaomi.cc.cd` 是 DNS-only A 記錄。

## 反爬與風險控制

Worker 做了基礎防護，目標是降低公開列表被爬取和被濫用的風險：

- Worker 代碼提供 `robots.txt` 禁止抓取；若 Cloudflare 啟用了 managed robots / AI Content Signals，線上 `/robots.txt` 可能由 Cloudflare 接管；
- 所有響應加 `X-Robots-Tag: noindex,nofollow,noarchive`；
- 常見 bot / crawler / curl / wget / python-requests / 掃描器 UA 直接 403；
- 文本與 JSON 數據接口需要認證（Cookie 或 HMAC Token）；公開 `/health` 只返回最小健康信息，詳細 `/health/full` 與 `/stats` 需要認證；
- 接口使用 `private, max-age=300`，避免被公共緩存長期保存；
- 支援 ETag/304 緩存，減少不必要的數據傳輸。

安全性：HMAC-SHA256 簽名，密鑰存儲在 Cloudflare Worker Secrets 中。

這不是強安全認證；如果要更嚴格，下一步應改為固定私密 token 或 Cloudflare Access。

Rate Limiting：接口使用 `private, max-age=300`，避免被公共緩存長期保存；支援 ETag/304 緩存，減少不必要的數據傳輸。

安全 Headers：所有響應加 `X-Robots-Tag: noindex,nofollow,noarchive`；常見 bot / crawler / curl / wget / python-requests / 掃描器 UA 直接 403。

## 重新生成數據

```bash
python3 build_dataset.py
```

腳本會：

1. 從 5 個數據源下載候選 IP（自動去重）
2. 只保留 `#US`、IPv4、`:443`
3. 調用 `https://api.090227.xyz/check?proxyip=<ip>` 驗證
4. 只保留 `success=true` 且 `supports_ipv4=true`
5. 重寫 `file result.json` 和 `docs/`

重新生成後，需把精簡後的 `file docs/full.json` 內嵌到 `file worker.js`，更新 Cloudflare DNS A 記錄，再部署：

```bash
wrangler deploy
```

## 自動巡檢與自癒

已提供端到端腳本：

```bash
python3 scripts/auto_update.py
```

它會自動：

1. 重新生成數據；
2. 檢測當前主 IP；仍有效則保持不變；連續失效後才從候選池 failover；
3. 同步數據到 KV 存儲；
4. 同步 `proxyip.leilaomi.cc.cd` 的 1 條 DNS-only A 記錄；
5. 部署 Worker；
6. 驗證 `list.leilaomi.cc.cd`、接口防護、DNS、HMAC Token；
7. 若數據有變化，自動 commit 並 push 到 GitHub。

自動化不依賴 Zo Computer；已遷移到 GitHub Actions，每 3 小時在 GitHub 託管 runner 執行一次，避免 Zo 休眠導致漏跑。需要在 GitHub repo secrets 中保存 `CLOUDFLARE_API_TOKEN` 和 `PROXYIP_HMAC_SECRET`。

## GitHub Actions

自動化入口：`.github/workflows/proxyip-auto-update.yml`。

- Cron：每 3 小時一次，`17 */3 * * *` UTC。
- 可手動執行：GitHub repo → Actions → ProxyIP Auto Update → Run workflow。
- 使用 GitHub 內建 `GITHUB_TOKEN` 推送資料快照。
- 使用 repo secret `CLOUDFLARE_API_TOKEN` 更新 DNS 與部署 Worker。
- 使用 repo secret `PROXYIP_HMAC_SECRET` 生成 HMAC Token。

### 所需 Secrets
| Secret | 用途 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 權限（DNS + Workers） |
| `PROXYIP_HMAC_SECRET` | GitHub Actions 用於生成 HMAC Token |

Cloudflare Worker 端還需要設置 Worker Secret：`PROXYIP_SECRET`。它的值必須與 GitHub repo secret `PROXYIP_HMAC_SECRET` 相同。

## GitHub Pages

GitHub Pages 已關閉；實際發布為 `proxyip.leilaomi.cc.cd` 的 DNS-only A 記錄與 `list.leilaomi.cc.cd` 的 Cloudflare Worker。倉庫保留 `docs/` 作為可審核的部署數據快照。

## 單一地區策略

目前策略是穩定優先，且鎖定單一出口地區：

- `PROXYIP_TARGET_COUNTRIES=US`：只保留檢測出口國家為 US 的 ProxyIP；
- `PROXYIP_PREFERRED_COLOS=IAD`：同等風險下優先 IAD / Ashburn；
- `proxyip.leilaomi.cc.cd` 永遠只同步 1 條 DNS-only A 記錄；
- 當前 IP 健康且仍符合目標地區時不切換，避免 AI / CF CDN 站點看到出口亂跳；
- 如需改成其他單一地區，調整 GitHub Actions/環境變量中的 `PROXYIP_TARGET_COUNTRIES` 和 `PROXYIP_PREFERRED_COLOS` 後重新跑 `scripts/auto_update.py`。


### 2026-06-02 — 穩定性與線上核查後改進

| 文件 | 改進 |
|------|------|
| `build_dataset.py` | 修復直接 HTTPS fallback 結果與 `enrich()` 字段不兼容的問題 |
| `build_dataset.py` | 增加當前主 IP 最低質量門檻與切換冷卻時間 |
| `build_dataset.py` | `docs/full.json` 不再提交完整 `all_results` debug 數據，降低倉庫體積 |
| `worker.js` | `/health` 改為最小公開信息，新增需認證的 `/health/full` |
| `worker.js` | `/stats` 改為需 Cookie/HMAC Token 認證 |
| `worker.js` | 增加數據新鮮度 stale 判斷、HEAD 支持、304 安全 headers、CSP、Permissions-Policy |
| `worker.js` | Rate limiter 增加過期 bucket 清理 |
| `scripts/*.py` | 域名與 zone 支援環境變量覆蓋 |
| `README.md` | 移除易過期的動態數字，明確 GitHub Secret 與 Worker Secret 的關係 |
