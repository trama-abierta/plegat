# Guía de puesta en marcha

La referencia del proyecto está en [README.md](README.md).

## Desarrollo Node + PostgreSQL

```bash
npm ci
npm run setup:local
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Web: `http://127.0.0.1:5173` · API: `http://127.0.0.1:3000`.

## Compose completo

```bash
cp .env.example .env
# Configura SITE_ADDRESS y las rutas de secretos
docker compose build backend frontend
docker compose --profile tools run --rm migrate
docker compose up -d postgres backend frontend proxy
```

## Verificación

```bash
npm run lint
npm test
npm run test:ui
npm run build
docker compose config --quiet
```

## Drizzle Studio

```bash
npm run db:studio
```

Las migraciones aplicadas no se editan ni se ejecutan de nuevo. Crea una nueva migración y verifica el estado antes de desplegar.

## Tauri

```bash
npm run tauri -- dev
npm run tauri -- build --bundles deb
```

El cliente usa `VITE_PLEGAT_API_ORIGIN` para la API y `VITE_PLEGAT_WEB_ORIGIN` para abrir la web.
