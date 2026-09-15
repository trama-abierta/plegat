# Plegat

Plegat es una aplicación de registro horario para organizaciones españolas. Está diseñada para funcionar primero **on-premise**, con PostgreSQL y Docker Compose, y evolucionar después a un SaaS multi-tenant portable.

El proyecto está en fase MVP. Incluye web, API, correcciones auditables, informes y un cliente Tauri para Windows/Linux. Antes de usarlo con datos laborales reales hay que validar la configuración, el convenio aplicable, la política de conservación y el procedimiento de la organización.

## Funcionalidades

- Web responsive con React y Vite.
- Jornada personal: entrada, pausas, reanudación, salida, historial y solicitudes.
- Demo sin login persistida en `localStorage`; las vistas autenticadas usan PostgreSQL.
- API REST en Node.js y Fastify.
- PostgreSQL 17 con Drizzle ORM y migraciones versionadas.
- Organizaciones multi-tenant, usuarios, membresías y roles.
- Correcciones append-only con aprobación, cascadas y trazabilidad.
- Auditoría de operaciones relevantes.
- Informes administrativos exportables.
- PWA preparada para navegador.
- Cliente Tauri 2 con OAuth Authorization Code + PKCE, bandeja y fichaje reducido.
- Base reservada para React Native/Expo.

## Estado

| Área | Estado |
| --- | --- |
| Web personal, historial, solicitudes y perfil | Implementado |
| Administración de equipo, registros, correcciones, informes y configuración | MVP implementado |
| PostgreSQL y Drizzle | Implementado |
| Auth web y sesiones persistidas | Implementado |
| Tauri, deep link y PKCE | Implementado para desarrollo/Linux |
| PWA offline sincronizable | Pendiente |
| React Native/Expo | Pendiente |
| SSO y autoalta por dominio | Fuera del MVP |

## Requisitos

- Node.js `>=22.14.0` y npm.
- Docker y Docker Compose para PostgreSQL/despliegue.
- Rust y dependencias Tauri 2 para compilar escritorio (WebKitGTK/GTK/AppIndicator en Linux).

## Desarrollo rápido

```bash
git clone <URL_DEL_REPOSITORIO>
cd plegat
npm ci
npm run setup:local
npm run dev
```

Web: <http://127.0.0.1:5173> · API: <http://127.0.0.1:3000>.

Para usar PostgreSQL con Compose:

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

El script `setup:local` crea `.env` y secretos de desarrollo si faltan, sin sobrescribirlos. Nunca publiques `.env` ni credenciales.

## Scripts

```bash
npm run dev                         # API + web en watch
npm run build                       # build web
npm test                            # pruebas Node
npm run test:ui                     # pruebas UI
npm run lint                        # ESLint
npm run db:migrate                  # migraciones SQL históricas
npm run db:studio                   # Drizzle Studio
npm run db:generate -w @plegat/backend
npm run db:migrate:drizzle -w @plegat/backend
npm run db:seed -w @plegat/backend
npm run tauri -- dev                # cliente Tauri
npm run tauri -- build --bundles deb
```

## Configuración

Copia `.env.example` y configura los secretos fuera del repositorio. En producción se recomiendan secretos montados como archivos:

```dotenv
SITE_ADDRESS=https://fichaje.example.com
PUBLIC_ORIGIN=https://fichaje.example.com
FRONTEND_ORIGIN=https://fichaje.example.com
POSTGRES_DB=plegat
POSTGRES_USER=plegat_owner
APP_DB_USER=plegat_app
DB_OWNER_PASSWORD_PATH=/etc/plegat/secrets/db-owner-password
DB_APP_PASSWORD_PATH=/etc/plegat/secrets/db-app-password
SESSION_SECRET_PATH=/etc/plegat/secrets/session-secret
```

PostgreSQL guarda instantes en UTC. La organización mantiene una zona IANA (por ejemplo `Europe/Madrid`) para agrupar y mostrar jornadas. Tauri usa `VITE_PLEGAT_API_ORIGIN` para la API y `VITE_PLEGAT_WEB_ORIGIN` para abrir la web.

## Arquitectura

```text
Navegador / PWA / Tauri / móvil futuro
                    │ HTTPS
                 Caddy 2
              ┌─────┴─────┐
          frontend      /api/v1
        estático         Fastify
                            │
                        PostgreSQL
```

El dominio es un monolito modular. Las rutas autentican y validan; los servicios/store contienen las reglas. PostgreSQL es la fuente de verdad y Caddy es el único componente público en producción.

## Monorepo

```text
apps/backend/       API Fastify, Drizzle, migraciones y seed
apps/frontend/      React/Vite y vistas web
apps/desktop/       Tauri 2, React y Rust
apps/mobile/        reservado para React Native/Expo
packages/api-client cliente HTTP compartido
packages/schemas    contratos compartidos
packages/shared     utilidades compartidas
packages/ui         componentes visuales
docker/             Dockerfiles y Caddy
docs/               cumplimiento, ADR y planes
tests/              pruebas backend/UI
```

El código propio usa JavaScript/JSX y ESM; no se introduce TypeScript. Rust solo pertenece a la envoltura Tauri.

## Identidad y permisos

`users` es la identidad global. `employees` es la ficha laboral dentro de una organización y se vincula mediante `employees.user_id`. `memberships` asigna rol y estado por tenant. Una misma persona puede ser empleada y administradora; puede haber varios administradores.

Roles actuales: empleado, responsable, administrador de empresa, auditor de solo lectura y operador de plataforma. Cada ruta resuelve el tenant en el servidor y comprueba la membresía; nunca se confía en un `tenant_id` enviado por el cliente.

## Fichajes y correcciones

Los eventos `clock_in`, `break_start`, `break_end` y `clock_out` son append-only. Incluyen instante UTC, recepción del servidor, secuencia e idempotencia. Las transiciones inválidas devuelven conflicto y los reintentos con la misma clave no duplican eventos.

Una corrección nunca modifica ni elimina físicamente el original. Guarda solicitante, motivo, valores originales/propuestos, eventos afectados, decisión, revisor y fechas. Las cascadas se representan como elementos derivados. La proyección efectiva se reconstruye con originales y ajustes aprobados.

Las jornadas pueden cruzar medianoche. No se genera una salida ficticia: la sesión permanece abierta hasta el cierre real o una corrección auditable.

## API principal

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/me
GET  /api/v1/me/attendance
POST /api/v1/me/events
GET  /api/v1/me/corrections
POST /api/v1/me/corrections
GET  /api/v1/tenants/:tenantId/attendance
GET  /api/v1/tenants/:tenantId/corrections
PATCH /api/v1/tenants/:tenantId/corrections/:id
GET  /api/v1/tenants/:tenantId/reports/attendance.csv
```

Si cambia un contrato, actualiza esquemas, pruebas y documentación en la misma entrega.

## Seguridad

- Hash de contraseñas y sesiones opacas persistidas como hash.
- Rate limiting de login, sesiones revocables y protección CSRF.
- CORS con orígenes explícitos, nunca `*` en producción.
- OAuth desktop con PKCE; access token en memoria y refresh token en keyring.
- Tauri de instancia única y callback `plegat://oauth/callback`.
- PostgreSQL privado y credenciales de menor privilegio.
- Validación, idempotencia, aislamiento por tenant y auditoría.
- Sin biometría, GPS continuo, capturas ni monitorización invasiva.

Consulta [SECURITY.md](SECURITY.md) y [docs/compliance/es-registro-horario.md](docs/compliance/es-registro-horario.md).

## Docker y operación

```bash
cp .env.example .env
# Configura dominio y secretos

docker compose build backend frontend
docker compose --profile tools run --rm migrate
docker compose up -d postgres backend frontend proxy
```

Programa backups PostgreSQL cifrados, verifica restauraciones y define RPO/RTO. Un volumen Docker no es un backup. El frontend de producción es estático y el backend escucha solo detrás de Caddy.

## Informes y cumplimiento

Los informes deben incluir organización, persona, período, zona horaria, entradas/salidas, pausas, incidencias, correcciones, revisión y fecha de generación. CSV y PDF son los formatos del MVP; XLSX puede añadirse manteniendo tipos correctos y protección contra fórmulas.

Plegat facilita el registro diario, conservación y trazabilidad previstos en el artículo 34.9 del Estatuto de los Trabajadores. La empresa sigue siendo responsable de informar a las personas, identificar el convenio y validar RGPD/LOPDGDD. La referencia de conservación laboral es de cuatro años, sujeta a validación jurídica.

## Roadmap

1. Endurecimiento de producción, backups y observabilidad.
2. PWA con sincronización offline y resolución de conflictos.
3. Informes oficiales y XLSX.
4. Instaladores Tauri Windows/Linux mantenibles.
5. React Native/Expo.
6. SaaS alojado mediante adaptadores cloud-agnostic (ECS/Fargate, RDS, S3 u otros).

SSO Google/Microsoft, autoalta por dominio, biometría y nóminas quedan fuera del MVP.

## Contribuir y licencia

Lee [CONTRIBUTING.md](CONTRIBUTING.md) y [SECURITY.md](SECURITY.md). No subas secretos, datos reales ni dumps. La licencia open source aún debe decidirse: añade `LICENSE` antes de publicar el repositorio.
