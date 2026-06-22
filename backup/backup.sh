#!/bin/sh
# memos のデータを Cloudflare R2 へ restic でバックアップする。
# - SQLite はオンラインバックアップ API で整合スナップショットを取る（memos 無停止）
# - assets 等その他ファイルは /data からそのまま取り込む
# - 取得後に保持ポリシーで世代を整理する
set -eu

DB=/data/memos_prod.db
SNAP=/snapshot

echo "[backup] $(date '+%F %T') start"

rm -rf "$SNAP"
mkdir -p "$SNAP"

if [ -f "$DB" ]; then
  # online backup: memos が書き込み中でも整合した断面を取得できる
  sqlite3 "$DB" ".backup '$SNAP/memos_prod.db'"
  echo "[backup] sqlite consistent snapshot OK ($(du -h "$SNAP/memos_prod.db" | cut -f1))"
else
  echo "[backup] WARN: $DB not found (memos が未初期化か、DB 名が異なる可能性)"
fi

# リポジトリ未初期化なら初期化（暗号化リポジトリを R2 上に作成）
if ! restic snapshots >/dev/null 2>&1; then
  echo "[backup] initializing restic repository"
  restic init
fi

# 整合スナップショットの DB と、それ以外の実体（assets 等）を取り込む。
# ライブの memos_prod.db* は不整合な断面になりうるので除外する。
restic backup "$SNAP" /data \
  --tag memos \
  --exclude "$DB" \
  --exclude "${DB}-wal" \
  --exclude "${DB}-shm"

# 保持ポリシー: 日次7 / 週次4 / 月次6。古い世代は prune で物理削除。
restic forget --prune \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6

echo "[backup] $(date '+%F %T') done"
