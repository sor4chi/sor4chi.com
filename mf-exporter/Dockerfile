FROM node:24.18.0-bookworm-slim AS builder

WORKDIR /app
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH=/pnpm:$PATH

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@12.4.2 --activate \
    && pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm rebuild --pending

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=8000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@12.4.2 --activate \
    && pnpm install --prod --frozen-lockfile --ignore-scripts \
    && pnpm rebuild --pending \
    && mkdir -p /data \
    && chown -R pwuser:pwuser /app /data

COPY --from=builder --chown=pwuser:pwuser /app/dist ./dist

USER pwuser
EXPOSE 8000
CMD ["node", "dist/main.js"]
