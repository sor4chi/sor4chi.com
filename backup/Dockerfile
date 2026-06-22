FROM restic/restic:latest

# sqlite3: SQLite を停止せず online backup API で整合スナップショットを取るため
# tzdata: cron を JST 等のローカル時刻で動かすため
RUN apk add --no-cache sqlite tzdata

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/backup.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
