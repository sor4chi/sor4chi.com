# memos backup (restic → Cloudflare R2)

memos のデータ（SQLite `memos_prod.db` と assets）を毎日 Cloudflare R2 へ
restic で暗号化・増分バックアップする常駐コンテナ。

## 仕組み

- `backup.sh` が SQLite を **オンラインバックアップ API** で整合スナップショット化（memos 無停止）し、restic で R2 に送る。
- 保持ポリシーは日次7 / 週次4 / 月次6。`restic forget --prune` で自動整理。
- スケジュールは `BACKUP_CRON`（デフォルト `0 4 * * *` = 毎日 04:00 JST）。

## セットアップ

### 1. Cloudflare R2 を用意

1. Cloudflare ダッシュボード → R2 → **Create bucket**（例: `memos-backup`）
2. R2 → **Manage R2 API Tokens** → **Create API token**
   - Permissions: **Object Read & Write**、対象を該当バケットに限定
   - 発行された **Access Key ID** / **Secret Access Key** を控える
3. Account ID（R2 概要ページ右側、または S3 エンドポイント `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`）を控える

### 2. secrets を埋める

```bash
cp secrets/.env.r2.example secrets/.env.r2
cp secrets/.env.restic-password.example secrets/.env.restic-password

# .env.r2 を編集（ACCOUNT_ID / バケット名 / R2 キー）
# restic の暗号化パスフレーズを生成
openssl rand -base64 32 > secrets/.env.restic-password
```

> **重要**: `secrets/.env.restic-password` を失うと **復元不能**。
> パスワードマネージャ等、このサーバー以外の場所にも必ず控える。

### 3. 起動と初回バックアップ

```bash
docker compose build memos-backup
# 初回だけ即時実行してリポジトリ初期化＋1世代取得を確認
RUN_ON_START=true docker compose run --rm memos-backup
# 問題なければ常駐起動
docker compose up -d memos-backup
docker compose logs -f memos-backup
```

## 運用コマンド

```bash
# 世代一覧
docker compose run --rm memos-backup snapshots

# リポジトリ健全性チェック
docker compose run --rm memos-backup check

# 復元（最新世代を /restore に展開）※ restore.sh 参照
docker compose run --rm -v "$PWD/restore:/restore" memos-backup \
  restore latest --target /restore
```

復元手順の詳細は `restore.sh` を参照。
