# Seguridad

No publiques vulnerabilidades en issues. Contacta privadamente con las personas mantenedoras e incluye versión, impacto y pasos de reproducción.

Plegat conserva eventos de fichaje y auditoría como append-only, mantiene originales al aprobar correcciones y comprueba tenant/rol en cada operación. Las sesiones web guardan hashes; Tauri usa PKCE, keyring y tokens de corta exposición. PostgreSQL, secretos y backups deben permanecer fuera del acceso público.

La documentación de `docs/compliance/` describe controles laborales y de privacidad, pero no sustituye una revisión independiente antes de producción.
