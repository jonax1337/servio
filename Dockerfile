# Servio — production image.
#
# NOTE: build this in your own environment (`docker compose build`) — it was
# authored but not test-built in CI. Runs the app with `next start` and the full
# dependency tree so Prisma's engines/CLI are present for `prisma db push` at boot
# (see docker/entrypoint.sh). SQLite lives on the /data volume by default.

FROM node:22-slim AS build
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install deps first (cached until the lockfile changes).
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Build the app.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate && pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM build AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/servio.db
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["pnpm", "start"]
