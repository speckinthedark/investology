# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build          # produces dist/

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Only install production deps (keeps image small)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and server source
COPY --from=builder /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY agents/ ./agents/
COPY src/types.ts ./src/types.ts

# tsx runs server.ts directly — no separate compile step needed
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
