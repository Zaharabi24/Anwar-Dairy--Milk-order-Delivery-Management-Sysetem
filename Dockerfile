# syntax=docker/dockerfile:1

# ---------- deps: install exactly what bun.lock pins ----------
FROM oven/bun:1-alpine AS bun

FROM node:24-alpine AS deps
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ---------- build: produce a standalone Node server in .output ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Lovable's Vite config targets Cloudflare by default; build for plain Node instead.
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production
RUN npm run build

# ---------- runtime: only the build output (SQL migrations are bundled in) ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

# The home page reads from PostgreSQL, so this also fails if the database is unreachable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
