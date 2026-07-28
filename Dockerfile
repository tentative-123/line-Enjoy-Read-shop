# Railway backend + LIFF image. Wrangler provides the Cloudflare Worker/D1/R2
# compatibility runtime while Railway provides the container and persistent volume.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @line-crm/shared build \
 && pnpm --filter @line-crm/line-sdk build \
 && pnpm --filter @line-harness/update-engine build \
 && pnpm --filter worker build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY --from=build /app /app
RUN chmod +x scripts/railway-start.sh
EXPOSE 8080
CMD ["bash", "scripts/railway-start.sh"]
