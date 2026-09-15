FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci --workspace=@plegat/frontend --include-workspace-root=false
RUN npm run build --workspace=@plegat/frontend

FROM caddy:2-alpine
COPY docker/frontend.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/frontend/dist /srv
EXPOSE 8080
