# Use the official Bun image
FROM oven/bun:latest as base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Final stage
FROM oven/bun:latest
WORKDIR /usr/src/app
COPY --from=base /usr/src/app .

# Start the server
CMD ["bun", "src/index.ts"]
