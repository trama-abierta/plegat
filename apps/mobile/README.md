# App móvil

Aplicación React Native CLI para Android e iOS, escrita en JavaScript. El MVP se limitará a **Mi jornada** y reutilizará los contratos HTTP, las reglas de transición, la idempotencia y OAuth/PKCE del backend.

No se usarán fichajes offline: si no hay red, la acción no se confirma ni se almacena para enviarla después. Los valores locales se reservan para tokens protegidos mediante Keychain/Keystore y preferencias no sensibles.

Copia `.env.example` a la configuración local del entorno y adapta los orígenes según el emulador o dispositivo. Nunca guardes secretos ni archivos `.env` reales en Git.
