# ============================================================
# LuxTalent Frontend — Dockerfile V2 (Next.js standalone)
# ============================================================

# --- Stage 1: Install ALL dependencies (including dev + optional natives) ---
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
# Full install: devDeps needed for build, optional needed for lightningcss musl binary
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client with correct binary targets for Alpine/musl
RUN npx prisma generate

# Client-side: use /flask-api prefix (proxied by Next.js rewrites)
ENV NEXT_PUBLIC_FLASK_API_URL=/flask-api
# Server-side: Next.js rewrites will proxy /flask-api/* to this URL
ENV FLASK_API_URL=http://api:8000
ENV NEXT_PUBLIC_USE_MOCK=false

RUN npm run build

# --- Stage 3: Production ---
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy Prisma engine binaries needed at runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Copy the SQLite database directory if it exists
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:./db/custom.db"

CMD ["node", "server.js"]