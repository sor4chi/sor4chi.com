#!/bin/sh
# memos のバックアップ常駐コンテナのエントリポイント。
#
# 使い方:
#   引数なし         -> BACKUP_CRON のスケジュールで backup.sh を回す常駐モード
#   backup-now       -> 即時に一度だけバックアップして終了（初回確認・手動実行用）
#   それ以外の引数    -> restic にそのまま渡す（例: snapshots / check / restore ...）
set -eu

if [ "$#" -gt 0 ]; then
  case "$1" in
    backup-now) exec /usr/local/bin/backup.sh ;;
    *) exec restic "$@" ;;
  esac
fi

: "${BACKUP_CRON:=0 4 * * *}"

# cron ジョブの出力をコンテナ標準出力/標準エラー (crond=PID1) に流す
echo "$BACKUP_CRON /usr/local/bin/backup.sh >/proc/1/fd/1 2>/proc/1/fd/2" > /etc/crontabs/root
echo "[entrypoint] scheduled backup: '$BACKUP_CRON' (TZ=${TZ:-UTC})"

# 常駐起動時に一度だけ実行したい場合は RUN_ON_START=true
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] RUN_ON_START=true -> running once now"
  /usr/local/bin/backup.sh || echo "[entrypoint] initial backup failed (will retry on schedule)"
fi

exec crond -f -l 8
