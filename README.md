# 金鉴后端（jin-jian-au9999）

`main` 是后端。前端在分支 `frontend-jd-zheshang`，静态站点部署在 CloudBase **webapps**。本树没有前端 `src/` 或 `public/`。

**实时金价 = 京东积存金（浙商积存金），由后端函数在服务端拉取。** 不走浏览器 CORS，也不再把极速数据 `shgold` 或上金所 Au99.99 当主路径。上游不需要密钥：

`https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=1961543816`

共享模块是 `lib/jd-quote.mjs`。CloudBase `cloudfunctions/jd-quote`、Vercel `api/quote.js` / `api/jd-quote.js`、Cloudflare `worker.js` 都打这一条。

| 入口 | 路由 | 返回 |
|------|------|------|
| `cloudfunctions/jd-quote` | `/api/jd-quote` | 京东原始 JSON。成功时写入 `jinjian_last_snapshot.quote_json`；上游失败则回读该快照 |
| `api/jd-quote.js`、`worker.js` | `/api/jd-quote`、`/jd-quote` | 同一份京东原始 JSON（`resultData.datas.price` / `yesterdayPrice` / `time`）。无数据库回退 |
| `api/quote.js`、`worker.js` | `/api/quote`、`/quote` | 给旧行情消费者的 feed：`symbol`、`currency`、`unit`、`note`、`quote`、`bars`，并带 `sourceLabel` |

`quote` 字段：`price`、`open`、`high`、`low`、`prevClose`、`time`、`sourceLabel`（`浙商积存金(京东)`）。京东这个接口没有日内开高低，`open` / `prevClose` 用昨收，`high` / `low` 取现价和昨收的较大值 / 较小值。`time` 是东八区 `YYYY-MM-DDTHH:mm:ss+08:00`。`symbol` 仍是 `Au99.99`，这是旧 feed 的键，品种是浙商积存金，不是上金所 Au99.99。`bars` 只有当日一根（`source: "live"`）。

线上 CloudBase 路由见下一节。Vercel 的 `vercel.json` 把 `/quote`、`/jd-quote`、`/news` 转到对应的 `api/` 文件。Cloudflare Worker 要和 `lib/jd-quote.mjs` 一起部署，不要只粘贴 `worker.js`。

## CloudBase（线上）

环境 ID：`testgold-d6g8l28m85a3d21aa`（`ap-shanghai`）。

HTTP 服务主机形如 `testgold-….app.tcloudbase.com`。快照函数请求新闻时使用：

`https://testgold-d6g8l28m85a3d21aa-1512175549.ap-shanghai.app.tcloudbase.com/api/news`

| 路由 | 云函数 | 作用 |
|------|--------|------|
| `/api/jd-quote` | `cloudfunctions/jd-quote` | 京东积存金最新价。成功时写入 `jinjian_last_snapshot.quote_json`；上游失败则回读该快照 |
| `/api/news` | `cloudfunctions/jinjian-news` | 天行财经 → `{ items }`。上游失败时回退 `NEWS_FALLBACK_URL`（默认 Vercel `/api/news`），再不行用包内 `seed-news.json` |
| `/api/last-feed`、`/api/last-news` | `cloudfunctions/jinjian-snapshot` | 读上次的 feed / 新闻。路径带 `refresh` 时重拉京东行情；`/api/last-snapshot/refresh` 同时刷新新闻。定时触发只更新行情 |
| `/api/settings` | `cloudfunctions/jinjian-settings` | `GET` / `PUT` 读写「我的价位」和可选设置 |

### PostgreSQL

| 表 | 用途 | 迁移 |
|----|------|------|
| `jinjian_last_snapshot` | `quote_json`、`news_json`、`feed_json`、`source`、`updated_at`。`jd-quote` 与 `jinjian-snapshot` 共用 `id='default'` | 本仓库没有这张表的 SQL |
| `jinjian_user_settings` | `alerts_json`（价位）、`settings_json`、`updated_at` | `cloudbase/migrations/20261022103815_create_jinjian_user_settings.sql` |

### 密钥

密钥只放在云函数环境变量里，不进仓库。`.gitignore` 忽略 `*.xor`。

| 变量 | 谁用 |
|------|------|
| `TIANAPI_KEY`、`TIANAPI_KEY_B64`、`TIANAPI_KEY_XOR` | `jinjian-news`，按这个顺序取第一个非空值 |
| `TENCENTCLOUD_SECRETID`、`TENCENTCLOUD_SECRETKEY`、`TENCENTCLOUD_SESSIONTOKEN` | 平台注入的临时凭证，供 `jd-quote`、`jinjian-snapshot`、`jinjian-settings` 调 PostgreSQL |

## Vercel / Cloudflare

这些文件不是 CloudBase 线上路由，但实时金价已经和云函数用同一个京东上游。行情接口不需要 `JISU_APPKEY`。

| 文件 | 路由 | 说明 |
|------|------|------|
| `lib/jd-quote.mjs` | — | 京东 `stdLatestPrice` 拉取，以及 feed 映射 |
| `api/quote.js` | `/api/quote` | 归一化 feed，`sourceLabel` 为 `浙商积存金(京东)`。`vercel.json` 把 `/quote` 转到这里 |
| `api/jd-quote.js` | `/api/jd-quote` | 京东原始 JSON。`vercel.json` 把 `/jd-quote` 转到这里 |
| `api/news.js` | `/api/news` | 天行财经，与金价无关。`vercel.json` 把 `/news` 转到这里。环境变量 `TIANAPI_KEY` / `_B64` / `_XOR` |
| `worker.js` | `/api/quote`、`/quote`、`/api/jd-quote`、`/jd-quote` | Cloudflare Worker，引用 `lib/jd-quote.mjs` |

本地映射自测（无网络）。加 `--live` 会再打一次京东上游：

```bash
node scripts/smoke-local.mjs
node scripts/smoke-local.mjs --live
node scripts/smoke-news-local.mjs
```

部署后看实时价：

```bash
curl -sS https://<host>/api/quote
curl -sS https://<host>/api/jd-quote
```

`/api/quote` 里应有 `sourceLabel` = `浙商积存金(京东)`，`productSku` = `1961543816`，以及 `quote.price`、`quote.prevClose`、`quote.time`。`/api/jd-quote` 里应有 `success: true` 和 `resultData.datas.price`。

字段约定写在 `lib/jd-quote.mjs`、`api/quote.js` 文件头。新闻筛选词在 `api/news.js`。天行 `caijing` 文档写明仅限内部数据分析，不得用于终端展示。
