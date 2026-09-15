# App móvil

Aplicación React Native CLI para Android e iOS, escrita en JavaScript. El MVP se limitará a **Mi jornada** y reutilizará los contratos HTTP, las reglas de transición, la idempotencia y OAuth/PKCE del backend.

El scaffold usa React Native 0.87.1. El nombre visible es **Plegat** y los identificadores Android/iOS son `com.plegat.mobile`. Los colores de marca se definen en `src/brand.js` y en los recursos de arranque nativos.

Desde la raíz del monorepositorio, instala dependencias con `npm install` y ejecuta `npm run start -w @plegat/mobile`. Con Android SDK/JDK o Xcode/CocoaPods disponibles, abre la app con `npm run android -w @plegat/mobile` o `npm run ios -w @plegat/mobile`. La comprobación local de JavaScript es `npm run test -w @plegat/mobile`; `npm run bundle:android -w @plegat/mobile` genera un bundle de prueba en `/tmp`.

No se usarán fichajes offline: si no hay red, la acción no se confirma ni se almacena para enviarla después. Los valores locales se reservan para tokens protegidos mediante Keychain/Keystore y preferencias no sensibles.

Copia `.env.example` a la configuración local del entorno y adapta los orígenes según el emulador o dispositivo. Nunca guardes secretos ni archivos `.env` reales en Git.
