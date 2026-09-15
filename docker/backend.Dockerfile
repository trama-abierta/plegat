FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY . .
RUN npm ci --omit=dev --workspace=@plegat/backend --include-workspace-root=false

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/backend/src/server.js"]
