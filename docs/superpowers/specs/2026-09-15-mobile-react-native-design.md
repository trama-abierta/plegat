# Aplicación móvil Plegat — Diseño MVP

## Objetivo

Crear un cliente móvil para Android e iOS centrado exclusivamente en **Mi jornada**, con el mismo comportamiento de fichaje que web y desktop.

## Decisiones

- React Native CLI puro y JavaScript. El MVP usa una compuerta autenticada de dos estados; React Navigation se incorporará cuando haya más de una pantalla autenticada.
- Sin Expo como plataforma principal y sin TypeScript.
- `react-native-keychain` para access/refresh tokens.
- OAuth 2.0 Authorization Code con PKCE usando el navegador del sistema y el deep link `plegat://oauth/callback`.
- El backend sigue siendo la única fuente de verdad para estado, transiciones, idempotencia y tiempos.
- Polling cada 10 segundos mientras la pantalla está activa; refresco al volver a foreground.
- Sin fichajes offline: una acción sin red no se confirma ni se encola.
- Administración, historial, solicitudes y perfil permanecen en la web.

## Flujo funcional

1. El usuario pulsa entrar y el sistema abre el endpoint OAuth web.
2. La app genera `state`, `code_verifier` y `code_challenge`; conserva el estado temporal en memoria segura de sesión.
3. El callback valida `state`, intercambia el código y guarda tokens en Keychain/Keystore.
4. La app carga `/api/v1/me/attendance` y muestra el estado original del servidor.
5. Cada acción envía `Idempotency-Key` y solo se habilita si coincide con la transición válida.
6. Las solicitudes pendientes de corrección nunca sustituyen los fichajes originales; como máximo se muestra un aviso y un enlace a la web.

## Alcance de interfaz

Una pantalla autenticada compacta: estado visual, contador efectivo, contador de pausa, acción primaria contextual, terminar jornada, cerrar sesión y enlace discreto a Plegat web. Estados: sin iniciar, trabajando, en pausa, jornada cerrada y error de red.

## Seguridad y plataforma

No se almacenan contraseñas ni tokens en AsyncStorage. Los refresh tokens se revocan al cerrar sesión. El cliente no incluye secretos embebidos. Android requiere esquema/deep link registrado; iOS requiere URL Types y Associated configuration equivalente para el callback personalizado.

## Verificación

Pruebas unitarias del selector de acción y del cálculo de estados; pruebas de integración del login PKCE y de acciones idempotentes con el backend; build debug Android y build iOS en simulador/dispositivo antes de publicar.
