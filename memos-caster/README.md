# memos caster (Cloudflare Worker)

memos の webhook を受け取り、新規 **PUBLIC** メモを複数の Slack / Discord の
incoming webhook へ展開する Worker。エンドポイントは URL パスの SECRET TOKEN で保護する。

## セットアップ

```bash
cd memos-caster
pnpm install

# シークレットを登録（値はリポジトリに残らない）
openssl rand -hex 32                             # CAST_TOKEN 用に控える（URL に入れるので hex）
pnpm wrangler secret put CAST_TOKEN
pnpm wrangler secret put DISCORD_WEBHOOK_URLS     # カンマ区切りで複数可
pnpm wrangler secret put SLACK_WEBHOOK_URLS       # 任意

pnpm run deploy
```

## memos への登録

Settings → Webhooks に、トークン込みの URL を登録する:

```
https://memos-caster.<subdomain>.workers.dev/<CAST_TOKEN>
```

Worker は `/<CAST_TOKEN>` への POST だけ処理する（不一致は 404）。

## 環境変数

| 名前 | 種別 | 説明 |
| --- | --- | --- |
| `CAST_TOKEN` | secret | URL パスの SECRET TOKEN |
| `SLACK_WEBHOOK_URLS` | secret | Slack webhook をカンマ区切りで |
| `DISCORD_WEBHOOK_URLS` | secret | Discord webhook をカンマ区切りで |
| `MEMOS_PUBLIC_BASE_URL` | var | 例 `https://memos.sor4chi.com`。リンク生成に使う |
| `CAST_VISIBILITY` | var | 展開対象の visibility（既定 `PUBLIC`） |
| `CAST_MAX_CHARS` | var | 本文の最大文字数（既定 `1500`） |
| `CAST_DEBUG_RAW` | var | `1` で生ペイロードを `wrangler tail` に出力 |

## トークンのローテーション

`openssl rand -hex 32` → `pnpm wrangler secret put CAST_TOKEN` で上書き → memos の webhook URL を更新。

> memos のリリース版が webhook 署名（Standard Webhooks）に対応したら、署名検証へ移行できる。
