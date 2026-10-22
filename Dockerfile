# --- deps: install all dependencies (incl. dev, needed to build) ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# --- build: compile TypeScript + generate Prisma client ---
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- production dependencies only ---
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
# prisma generate needs the schema + the prisma CLI; client output already
# built in the `build` stage is copied in below instead of regenerating.

# --- runtime image ---
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma's query engine binary needs libssl at runtime; bookworm-slim
# doesn't include it by default.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
