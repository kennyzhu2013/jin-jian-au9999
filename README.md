# 金鉴后端（jin-jian-au9999）

`main` 是后端。前端在分支 `frontend-jd-zheshang`，静态站点部署在 CloudBase **webapps**。本树没有前端 `src/` 或 `public/`。

线上接口走 CloudBase 云函数。下面的 Vercel / Cloudflare 文件仍在仓库里，是旧入口。

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

## Vercel / 旧入口

这些文件还在，对应 Vercel 与 Cloudflare，不是 CloudBase 线上路由。

| 文件 | 路由 | 说明 |
|------|------|------|
| `api/quote.js` | `/api/quote` | 极速数据 `shgold` 实时价 + 上金所 Au99.99 日线。`vercel.json` 把 `/quote` 转到这里。环境变量 `JISU_APPKEY` |
| `api/news.js` | `/api/news` | 天行财经。`vercel.json` 把 `/news` 转到这里。环境变量同上 `TIANAPI_KEY` / `_B64` / `_XOR` |
| `worker.js` | `/api/quote`、`/quote` | Cloudflare Worker，同一套极速 + 上金所逻辑，密钥 `JISU_APPKEY` |
| `vercel.json` | — | 只做上面两条 rewrite |

本地映射自测（无网络）：

```bash
node scripts/smoke-local.mjs
node scripts/smoke-news-local.mjs
```

字段约定和筛选词写在 `api/quote.js`、`api/news.js` 文件头。天行 `caijing` 文档写明仅限内部数据分析，不得用于终端展示。
