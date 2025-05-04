FROM itzg/minecraft-server

ENV EULA="true"
ENV RCON_ENABLED="true"
ENV TYPE="VANILLA"
ENV VERSION="1.21.5"
ENV TZ="Asia/Tokyo"
ENV INIT_MEMORY="256M"
ENV MAX_MEMORY="1G"
ENV JVM_OPTS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005"

# Overwrite mc-vanilla/whitelist.json by fetching it every minute
RUN apt-get update && \
    apt-get install -y cron && \
    echo "* * * * * curl -o /data/whitelist.json https://raw.githubusercontent.com/sor4chi/sor4chi.com/refs/heads/main/mc-vanilla/whitelist.json" >> /etc/crontab && \
    chmod 0644 /etc/crontab && \
    crontab /etc/crontab

CMD ["cron", "-f"]
