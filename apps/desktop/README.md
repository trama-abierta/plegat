# Cliente de escritorio Plegat

Cliente Tauri 2 para Windows/Linux. Permite fichar, iniciar/terminar pausas y cerrar jornada; administración, correcciones e informes permanecen en la web.

## Desarrollo

```bash
npm run tauri -- dev
```

Variables principales: `VITE_PLEGAT_API_ORIGIN` (por defecto `http://127.0.0.1:3000`) y `VITE_PLEGAT_WEB_ORIGIN` (en desarrollo `http://127.0.0.1:5173`).

## OAuth

Usa Authorization Code + PKCE con callback `plegat://oauth/callback`. El access token solo vive en memoria; el refresh token se guarda en el keyring nativo. La aplicación es de instancia única y los callbacks se reenvían a la ventana existente.

## Bandeja y ventana

La ventana no tiene marco nativo. La cabecera se puede arrastrar; el botón `—` la oculta en el tray. El menú contextual permite abrir, cerrar sesión y salir. El cliente consulta el estado del backend cada 10 segundos.

## Compilación

```bash
npm run tauri -- build --bundles deb
npm run tauri -- build --bundles appimage
```

Los artefactos aparecen en `src-tauri/target/release/bundle/`. En desarrollo, `Ctrl+Shift+I` abre el inspector WebKit.
