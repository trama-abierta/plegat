# Contribuir a Plegat

1. Crea una rama y lee `README.md`, `docs/adr/` y la documentación del área.
2. Mantén JavaScript/JSX; no añadas TypeScript sin ADR.
3. Para cambios de esquema crea una migración nueva y actualiza seed/documentación.
4. No mezcles refactorizaciones grandes con cambios funcionales.
5. No subas `.env`, secretos, tokens, dumps ni datos laborales reales.

Antes de abrir una PR ejecuta:

```bash
npm run lint
npm test
npm run test:ui
npm run build
```

Los cambios de persistencia deben probar aislamiento por tenant, idempotencia y rollback con PostgreSQL real. En Tauri documenta el sistema operativo y formato de paquete probado.
