FROM node:20-alpine AS builder

WORKDIR /app

# Install all deps (including devDeps for build)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src/
COPY public ./public/
RUN npm run build
RUN npx prisma generate

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
