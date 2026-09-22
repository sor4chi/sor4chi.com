import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { errorFields, logger } from "./logger.js";
import { MetricsRegistry } from "./metrics.js";
import { synchronize } from "./sync.js";

const config = loadConfig();
const metrics = new MetricsRegistry();
let synchronizationRunning = false;

async function runSynchronization(): Promise<void> {
  if (synchronizationRunning) {
    logger.warn("Synchronization skipped because another run is active");
    return;
  }

  synchronizationRunning = true;
  const startedAt = metrics.startAttempt();
  logger.info("Synchronization started");
  try {
    const snapshot = await synchronize(
      config.authStatePath,
      config.assetHistoryCachePath,
      config.monthlyCachePath,
      config.historyMonths,
    );
    metrics.completeAttempt(startedAt, snapshot);
    logger.info("Synchronization completed", {
      assetHistoryCount: snapshot.assetHistory.length,
      monthlySummaryCount: snapshot.monthlySummaries.length,
      portfolioItemCount: snapshot.portfolio.length,
    });
  } catch (error) {
    metrics.failAttempt(startedAt);
    logger.error("Synchronization failed", errorFields(error));
  } finally {
    synchronizationRunning = false;
  }
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/metrics") {
    response.writeHead(200, {
      "content-type": "application/openmetrics-text; version=1.0.0; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(metrics.render());
    return;
  }

  if (request.method === "GET" && request.url === "/healthz") {
    const healthy = metrics.hasSuccessfulSnapshot();
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ healthy }));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found\n");
});

server.listen(config.port, "0.0.0.0", () => {
  logger.info("Metrics server started", {
    port: config.port,
    historyMonths: config.historyMonths,
    syncIntervalSeconds: config.syncIntervalMs / 1000,
  });
  if (config.syncOnStart) void runSynchronization();
});

const interval = setInterval(() => void runSynchronization(), config.syncIntervalMs);

function shutdown(signal: string): void {
  logger.info("Shutdown requested", { signal });
  clearInterval(interval);
  server.close((error) => {
    if (error !== undefined) {
      logger.error("HTTP server shutdown failed", errorFields(error));
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
