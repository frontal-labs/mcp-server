# Multi-stage build for Frontal MCP Server
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json bun.lock* ./
RUN \
  if [ -f bun.lock ]; then \
    corepack enable bun && bun install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    corepack enable npm && npm ci; \
  elif [ -f yarn.lock ]; then \
    corepack enable yarn && yarn install --frozen-lockfile; \
  else \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN \
  if [ -f bun.lock ]; then \
    corepack enable bun && bun run build; \
  else \
    npm run build; \
  fi

# Production image, copy all the files and run the app
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcpserver

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Set permissions
RUN chown -R mcpserver:nodejs /app
USER mcpserver

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Expose port for HTTP transport
EXPOSE 3000

# Set default command
CMD ["node", "dist/bin/frontal-mcp-server.js", "--transport", "http", "--port", "3000"]
