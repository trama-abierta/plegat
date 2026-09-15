# Mobile React Native MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear aplicaciones Android e iOS React Native CLI en JavaScript para registrar Mi jornada usando el backend existente.

**Architecture:** `apps/mobile` será un cliente React Native independiente. Compartirá contratos y utilidades HTTP con desktop mediante un paquete común, mientras que el backend mantiene autenticación, transiciones, auditoría e idempotencia.

**Tech Stack:** React Native CLI, JavaScript, React Navigation, react-native-keychain, Linking, fetch.

**Spec:** `docs/superpowers/specs/2026-09-15-mobile-react-native-design.md`

## Global Constraints

- Solo Mi jornada en móvil; administración, historial, solicitudes y perfil permanecen en web.
- JavaScript; no TypeScript.
- Sin Expo como plataforma principal.
- Tokens únicamente en Keychain/Keystore; nunca AsyncStorage.
- Sin fichajes offline.
- Polling de asistencia cada 10 segundos en foreground.

---

### Task 1: Scaffolding React Native CLI

**Files:**
- Create: `apps/mobile/package.json`, `apps/mobile/index.js`, `apps/mobile/App.js`
- Create: `apps/mobile/android/` y `apps/mobile/ios/` mediante React Native CLI
- Modify: `package.json` para registrar el workspace móvil

**Interfaces:**
- Produces `App` raíz y comandos `npm run android -w @plegat/mobile`, `npm run ios -w @plegat/mobile`.

- [ ] Crear el proyecto con React Native CLI y conservar JavaScript.
- [ ] Configurar nombre visible `Plegat`, identificadores Android/iOS y colores de marca.
- [ ] Ejecutar Metro y una build debug Android para verificar el arranque.

### Task 2: Cliente API y almacenamiento seguro

**Files:**
- Create: `apps/mobile/src/api/client.js`
- Create: `apps/mobile/src/auth/tokenStore.js`
- Create: `apps/mobile/src/auth/session.js`

**Interfaces:**
- `apiFetch(path, options)` añade bearer token, reintenta una vez tras refresh y devuelve `Response`.
- `saveTokens({accessToken, refreshToken})`, `loadTokens()`, `clearTokens()` usan Keychain/Keystore.
- `restoreSession()` devuelve `boolean`.

- [ ] Añadir `react-native-keychain` y configurar sus identificadores de servicio.
- [ ] Implementar refresh y logout sin guardar credenciales en almacenamiento no seguro.
- [ ] Probar restauración, expiración y limpieza de sesión.

### Task 3: OAuth PKCE y deep link

**Files:**
- Create: `apps/mobile/src/auth/oauth.js`
- Modify: `apps/mobile/App.js`, `android/app/src/main/AndroidManifest.xml`, `ios/*/Info.plist`

**Interfaces:**
- `beginLogin()` abre el navegador con `state`, `code_challenge` y `redirect_uri`.
- `completeLogin(url)` valida `state`, intercambia el código y persiste tokens.

- [ ] Generar verifier/challenge con Web Crypto o implementación PKCE compatible con React Native.
- [ ] Registrar `plegat://oauth/callback` en Android e iOS.
- [ ] Procesar callbacks en cold start y con la app ya abierta; rechazar `state` incorrecto.

### Task 4: Pantalla Mi jornada

**Files:**
- Create: `apps/mobile/src/attendance/attendance.js`
- Create: `apps/mobile/src/screens/AttendanceScreen.js`
- Modify: `apps/mobile/App.js`

**Interfaces:**
- `getAttendance()` obtiene `{events, state}`.
- `getNextAction(attendance)` devuelve `clock_in`, `break_start`, `break_end` o `clock_out`.
- `recordEvent(type)` envía `POST /api/v1/me/events` con `Idempotency-Key`.

- [ ] Replicar las transiciones válidas y deshabilitar acciones incompatibles.
- [ ] Mostrar jornada partida del mismo día como reanudación y mantener sus contadores.
- [ ] Ignorar correcciones pendientes y mostrar aviso con enlace a `/historial`.
- [ ] Añadir refresh al volver a foreground y polling cada 10 segundos en foreground.

### Task 5: Navegación, errores y cierre de sesión

**Files:**
- Create: `apps/mobile/src/navigation/AppNavigator.js`
- Create: `apps/mobile/src/screens/LoginScreen.js`
- Create: `apps/mobile/src/components/StatusBadge.js`

- [ ] Separar navegación autenticada y no autenticada.
- [ ] Mostrar errores de red sin perder la sesión local válida.
- [ ] Revocar/limpiar tokens en cerrar sesión y volver a login.

### Task 6: Pruebas y builds

**Files:**
- Create: `apps/mobile/src/attendance/attendance.test.js`
- Create: `apps/mobile/src/auth/oauth.test.js`
- Modify: `apps/mobile/README.md`

- [ ] Probar selector de acciones, jornada partida y solicitudes pendientes.
- [ ] Ejecutar build debug Android y pruebas en emulador/dispositivo.
- [ ] Ejecutar build iOS en simulador/dispositivo desde macOS o CI.
- [ ] Documentar requisitos, variables de entorno, deep links y comandos de publicación.
