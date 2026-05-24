FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN npm install -g bun@1.3.8 && bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g bun@1.3.8 && bun run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcpserver

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN chown -R mcpserver:nodejs /app
USER mcpserver

EXPOSE 3000

CMD ["node", "dist/bin/frontal-mcp-server.js", "--transport", "http", "--host", "0.0.0.0", "--port", "3000"]
