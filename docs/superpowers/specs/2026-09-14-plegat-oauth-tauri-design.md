# OAuth/OIDC para Plegat Desktop

## Objetivo

Permitir que el cliente Tauri autentique usuarios mediante el navegador del sistema usando Authorization Code + PKCE, mientras Plegat conserva la autoridad sobre usuarios, organizaciones, roles y sesiones.

## Decisiones

- Plegat es el servidor de autorización y la API de recursos.
- Google, Microsoft y otros proveedores OIDC son identidades federadas opcionales.
- Tauri es un cliente público: no contiene `client_secret`.
- La web usa cookie HttpOnly; Tauri usa access tokens cortos y refresh tokens rotatorios.
- El refresh token se almacena únicamente en el almacén seguro del sistema operativo.
- Un usuario pertenece a una sola organización.
- El primer usuario que crea una organización es `tenant_admin` y `employee`.
- El autoalta se configura por organización y crea usuarios nuevos con rol `employee`.
- La vinculación automática exige email externo verificado y coincidencia normalizada.
- MFA, modo offline y multi-organización quedan fuera del MVP.

## Flujo

Tauri genera `state`, `nonce`, `code_verifier` y `code_challenge`; abre `/oauth/authorize` en el navegador; Plegat autentica localmente o mediante OIDC; vuelve a `plegat://oauth/callback` con un código de un solo uso; Tauri intercambia el código en `/oauth/token`; Plegat entrega tokens propios.

## API

- `GET /oauth/authorize`: inicia autorización y valida PKCE, cliente, redirect URI y scopes.
- `GET /oauth/callback/:provider`: callback interno de Google/Microsoft/OIDC.
- `POST /oauth/token`: intercambia código o rota refresh token.
- `POST /oauth/revoke`: revoca una sesión desktop.

## Persistencia

- `oauth_clients`: clientes públicos, redirect URIs y scopes.
- `external_identities`: vínculo entre usuario Plegat y `provider_subject`.
- `oauth_authorization_codes`: códigos hashados, temporales y de un solo uso.
- `desktop_sessions`: refresh tokens hashados, dispositivo, versión, expiración y revocación.
- `tenant_settings.identity`: autoalta, dominios, proveedores y rol inicial.

## Seguridad

- Nunca se guardan contraseñas, tokens ni `code_verifier` en claro.
- Los códigos expiran rápidamente y se marcan usados dentro de una transacción.
- Los refresh tokens rotan y se revoca la familia si se reutiliza uno antiguo.
- Todas las vinculaciones, altas automáticas, revocaciones y fusiones escriben en `audit_log`.
- Tauri solo solicita capabilities mínimas, carga orígenes confiables y no accede a PostgreSQL.
