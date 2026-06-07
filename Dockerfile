FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
ARG BUN_VERSION=1.3.8
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    npm install -g bun@${BUN_VERSION} && bun install --frozen-lockfile

FROM base AS builder
ARG BUN_VERSION=1.3.8
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache \
    npm install -g bun@${BUN_VERSION} && bun run build

FROM node:20-alpine AS runner
ARG VERSION=unknown
ARG NODE_ENV=production
WORKDIR /app

ENV NODE_ENV=$NODE_ENV
ENV HOST=0.0.0.0

RUN apk add --no-cache wget

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 mcpserver

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN chown -R mcpserver:nodejs /app
USER mcpserver

EXPOSE 3000

LABEL org.opencontainers.image.source=https://github.com/frontal-labs/mcp-server
LABEL org.opencontainers.image.description="Model Context Protocol server for Frontal cloud services"
LABEL org.opencontainers.image.licenses=MIT
LABEL org.opencontainers.image.vendor=Frontal Labs
LABEL org.opencontainers.image.version=$VERSION

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/bin/frontal-mcp-server.js", "--transport", "http", "--host", "0.0.0.0", "--port", "3000"]
