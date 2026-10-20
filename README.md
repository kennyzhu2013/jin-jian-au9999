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
| 上游 | `GET https://apis.tianapi.com/caijing/index`（`form=1`） |
| 默认策略 | 拉最新 4 页（每页 50 条，**不传 word**），只保留标题或摘要命中黄金相关词的条目，按 `publishedAt` 降序取前 N 条（默认 20） |
| 单关键词 | `?word=`、`?page=` 或 env `TIANAPI_WORD` 仍走原来的一次查询，响应顺序与 `note` 不变 |
| 环境变量 | 按 `TIANAPI_KEY`、`TIANAPI_KEY_B64`、`TIANAPI_KEY_XOR`（XOR 十六进制）顺序取第一个可用值。密钥只放在 Vercel，**不要**写进代码、前端或本文件 |
| 金鉴设置 | 自定义消息 / `VITE_NEWS_API_URL` → `https://jinjian-quote-proxy.vercel.app/api/news` |

黄金相关词：`黄金`、`金价`、`金市`、`贵金属`、`伦敦金`、`现货金`、`纸黄金`、`金条`、`金饰`、`沪金`、`上金所`、`COMEX`、`XAU`、`Au99.99`。`金融` / `基金` / `公积金` / `金额` 不会命中。

**为什么不继续只用 `word=黄金`：** 天行 `caijing` 的关键词结果比「不传 word 的最新列表」更窄。2026-10-20 用同一密钥实测：不传 word 的第 1 页最新到 2026-10-19，其中已有 `2026-10-10` 的国际金价，以及 9 月多篇标题含「黄金 / 金价」的稿；`word=黄金` 的最新一条停在 `2026-10-08`，下一条跳到 `2026-06-05`，把上述 9 月稿漏掉。`generalnews` 与分类新闻 `allnews` 对该密钥返回 `code=160`（尚未申请）。网页转 API（黄金资讯 urlid=137）文档标明已下线。因此默认改为扫描最新列表再本地筛选，而不是多打几个同样会漏稿的 word 查询。

可选回补（默认关闭，避免把 6 月及更早的关键词结果再垫回列表尾部）：

| 变量 | 说明 |
|------|------|
| `TIANAPI_NEWS_PAGES` | 最新列表页数，1–4，默认 4 |
| `TIANAPI_NEWS_WORDS` | 逗号分隔的回补关键词，最多 2 个（如 `黄金,国际金价`）。`-` 或未设置表示不回补 |
| `TIANAPI_NUM` | 返回条数 1–50，默认 20。也可用 `?num=` |
| `TIANAPI_NEWS_CACHE_SECONDS` | 进程内缓存秒数。`0` 关闭。默认约 10 分钟；部分上游失败时缩短 |

每次未命中缓存的默认请求最多 4 次上游调用（并发 2，避免顶满免费档 QPS 3；单次超时约 3.5 秒，总预算约 9 秒）。遇到 `code=130`（频率超限）会等待约 0.4 秒再试一次。某一页失败时其余页照常返回，`note` 会带「部分上游失败」。全部失败才是 HTTP 502。成功响应 CDN 缓存约 10 分钟（失败页参与时约 1 分钟）。免费会员约 100 次/日，按 4 次调用计，轮询间隔宜 ≥10 分钟。

查询参数（仅调试）：`?pages=1..4`，`?words=黄金,金价` 或 `?words=-`。

字段映射：`id←tian-{id}`，`publishedAt←ctime(+08:00)`，`source←天行 · {source}`，`title`，`summary←description`；`topic` / `bias` / `horizon` 为标题摘要关键词启发式（非官方标签）。有上游 `url` 时附带。

**说明：** 天行文档写明该接口「仅限内部数据分析与机器学习，不得用于终端展示」；请自行阅读并遵守其条款。

申请：[天行注册](https://www.tianapi.com/) → 控制台拿 ApiKey → 在 [财经新闻文档页](https://www.tianapi.com/apiview/64) 申请开通该接口。若要启用综合新闻或分类新闻，需在对应文档页另行申请；当前密钥未开通。

