#!/bin/sh
# memos バックアップの復元ヘルパー（ホスト側で実行する想定の手順メモ兼スクリプト）。
#
# 復元は「R2 から restic で取り出す -> memos を止めて DB を差し替える -> 起動」。
# データ破壊を避けるため、対話確認を挟む。
#
# 使い方:
#   ./restore.sh            最新世代を ./restore/ に展開するだけ（安全・確認用）
#   ./restore.sh apply      展開後、memos を停止して memos_prod.db を本番へ反映
set -eu

cd "$(dirname "$0")/.."   # repo ルートへ
OUT=./restore

echo "[restore] 最新スナップショットを $OUT/ に展開します"
rm -rf "$OUT"
mkdir -p "$OUT"
docker compose run --rm -v "$PWD/restore:/restore" memos-backup \
  restore latest --target /restore

echo "[restore] 展開結果:"
find "$OUT" -maxdepth 3 -type f

if [ "${1:-}" != "apply" ]; then
  echo
  echo "[restore] 確認のみ完了。本番へ反映するには: ./backup/restore.sh apply"
  exit 0
fi

DB_SRC="$OUT/snapshot/memos_prod.db"
if [ ! -f "$DB_SRC" ]; then
  echo "[restore] ERROR: $DB_SRC が見つかりません。中断します。" >&2
  exit 1
fi

printf '[restore] memos を停止して DB を差し替えます。よろしいですか? [y/N] '
read -r ans
[ "$ans" = "y" ] || { echo "中断しました"; exit 1; }

docker compose stop memos
# 名前付きボリュームへ DB を書き戻す（ヘルパーコンテナ経由）
docker run --rm -v sor4chicom_memos-data:/data -v "$PWD/$OUT/snapshot:/src:ro" alpine \
  sh -c "cp /src/memos_prod.db /data/memos_prod.db && rm -f /data/memos_prod.db-wal /data/memos_prod.db-shm"
docker compose start memos
echo "[restore] 反映完了。memos の表示を確認してください。"
