FROM itzg/minecraft-server

ENV EULA="true"
ENV RCON_ENABLED="true"
ENV TYPE="VANILLA"
ENV VERSION="1.21.5"
ENV TZ="Asia/Tokyo"
ENV INIT_MEMORY="256M"
ENV MAX_MEMORY="1G"
ENV JVM_OPTS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005"

COPY --chown=1000:1000 ./server.properties /data/server.properties
COPY --chown=1000:1000 ./ops.json /data/ops.json
COPY --chown=1000:1000 ./whitelist.json /data/whitelist.json
COPY --chown=1000:1000 ./banned-players.json /data/banned-players.json
COPY --chown=1000:1000 ./banned-ips.json /data/banned-ips.json
COPY --chown=1000:1000 ./server-icon.png /data/server-icon.png

# Overwrite mc-vanilla/whitelist.json by fetching it every hour via cron
RUN apt-get update && \
    apt-get install -y cron && \
    echo "0 * * * * curl -o /data/whitelist.json https://raw.githubusercontent.com/sor4chi/sor4chi.com/refs/heads/main/mc-vanilla/whitelist.json" >> /etc/crontab && \
    chmod 0644 /etc/crontab && \
    crontab /etc/crontab

CMD ["cron", "-f"]
