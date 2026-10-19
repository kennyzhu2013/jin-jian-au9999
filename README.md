# jinjian-quote-proxy

金鉴（jin-jian）自定义行情代理：把极速数据 `shgold` 实时报价与上海黄金交易所（上金所）**Au99.99** 日线合并成金鉴所需的 JSON。

## 数据源

| 字段 | 来源 | 说明 |
|------|------|------|
| `quote` | 极速数据 `GET /gold/shgold` | 实时价 / 开高低 / 昨收 |
| `bars` | 上金所 `POST https://www.sge.com.cn/graph/Dailyhq` | 与 AKShare `spot_hist_sge(symbol="Au99.99")` 相同；表单 `instid=Au99.99`；行格式 `[date, open, close, low, high]`（无成交量） |

日线在函数内内存缓存约 3 小时；实时报价每次请求（或 CDN `max-age=30`）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `JISU_APPKEY` | 极速数据 appkey（**不要**写进代码或提交到仓库） |

## 部署到 Vercel

1. 在 Vercel 新建项目，导入本目录（或 `vercel deploy`）。
2. Project Settings → Environment Variables → 添加 `JISU_APPKEY`。
3. 部署后访问：`https://<你的域名>/api/quote`
4. 打开 [金鉴](https://jin-jian-au9999.vercel.app) → **设置** → **自定义行情**，粘贴上述 URL。

本地预览：

```bash
# 需已安装 Vercel CLI
export JISU_APPKEY=你的密钥
npx vercel dev
# 打开 http://localhost:3000/api/quote
```

## 可选：Cloudflare Worker

同目录 `worker.js`，绑定密钥后部署：

```bash
npx wrangler secret put JISU_APPKEY
npx wrangler deploy worker.js
```

Worker 路由：`/api/quote` 或 `/quote`。

## 返回示例

成功时 HTTP 200，形如：

```json
{
  "symbol": "Au99.99",
  "currency": "CNY",
  "unit": "克",
  "note": "极速数据实时 · 上金所日线",
  "quote": {
    "price": 958.12,
    "open": 952.0,
    "high": 960.5,
    "low": 950.8,
    "prevClose": 951.2,
    "time": "2026-10-19T11:02:01+08:00"
  },
  "bars": [
    {
      "date": "2026-04-01",
      "open": 700.1,
      "high": 706.5,
      "low": 698.0,
      "close": 705.2,
      "source": "sge"
    }
  ]
}
```

- `bars` 按日期升序，默认保留最近约 120 个交易日；`source` 固定为 `"sge"`。
- 上金所日线失败时仍返回 200 + 实时 `quote`，`bars` 为空并在 `note` 中说明回退。
- 实时与日线都失败时返回 HTTP 502：`{"error":"..."}`。

## 本地映射自测（无网络）

```bash
node scripts/smoke-local.mjs
node scripts/smoke-news-local.mjs
```

## 消息接口 `/api/news`（天行财经）

把天行 [财经新闻](https://www.tianapi.com/apiview/64) `caijing` 映射成金鉴 `{ items: [...] }`。

| 项 | 说明 |
|------|------|
| 上游 | `GET https://apis.tianapi.com/caijing/index` |
| 默认关键词 | `黄金`（可用 query `?word=` 或 env `TIANAPI_WORD` 覆盖） |
| 环境变量 | `TIANAPI_KEY_XOR`（XOR 后的十六进制，密钥留在 Vercel）或可选明文 `TIANAPI_KEY`（**不要**写进前端或仓库） |
| 金鉴设置 | 自定义消息 / `VITE_NEWS_API_URL` → `https://jinjian-quote-proxy.vercel.app/api/news` |

字段映射：`id←tian-{id}`，`publishedAt←ctime(+08:00)`，`source←天行 · {source}`，`title`，`summary←description`；`topic` / `bias` / `horizon` 为标题摘要关键词启发式（非官方标签）。可选附带上游 `url`。

**说明：** 天行文档写明该接口「仅限内部数据分析与机器学习，不得用于终端展示」；请自行阅读并遵守其条款。专用「黄金资讯 urlid=137」的网页转 API 已下线，故用 `caijing` + `word=黄金`。免费会员约 100 次/日；消息轮询建议 ≥2 分钟一次。

申请：[天行注册](https://www.tianapi.com/) → 控制台拿 ApiKey → 在 [财经新闻文档页](https://www.tianapi.com/apiview/64) 申请开通该接口。

