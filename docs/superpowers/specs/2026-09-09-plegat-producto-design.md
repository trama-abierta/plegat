# Plegat — dirección de producto y hoja de ruta

Estado: dirección visual, navegación y primera entrega aprobadas por el usuario el 2026-09-09. Este documento es una propuesta de diseño, no el plan técnico detallado ni una implementación funcional.

## Punto de partida
Scaffolding JavaScript, React/Vite, Fastify, PostgreSQL y Compose. La UI actual solo comprueba disponibilidad. Sin auth, fichajes, PWA ni clientes nativos implementados. README.md conserva la especificación original.

## Identidad aprobada
Marfil #f4f2ea, verde tinta #203b32, oliva #aabb81 y arena #ded4bd. Tipografía de sistema para controles y datos; serif editorial para un énfasis en la landing. Inspiración textil mediante ritmo, líneas y composición, sin decoración que perjudique la lectura. Plegat es un nombre provisional pendiente de comprobar como marca.

## Primera entrega visual propuesta
Prototipo separado del backend, con cuatro vistas: landing, mi jornada, administración y hoja de ruta. Datos ficticios identificados de forma permanente. Navegación funcional entre vistas; controles de fichaje deshabilitados. No anunciar prueba gratuita, certificación, precios ni IA inexistentes.

Landing: propuesta de valor, dos accesos a las vistas de ejemplo, preview del fichaje y tres beneficios. Mi jornada: estado, tiempo efectivo, entrada/pausas y semana reciente. Administración: resumen agregado, muestra de empleados e incidencia por revisar. Vista móvil en una columna; tablas con desplazamiento propio.

La implementación posterior contemplará carga, error, sesión caducada, sin conexión, jornada vacía, pausa, finalización y conflicto de concurrencia. Fichar nunca se presenta como confirmado antes de respuesta del servidor. Los estados visuales usan texto además de color.

## Enfoques considerados
1. Textil mediterráneo: cercano y distintivo; elegido por el usuario.
2. Industrial grafito/naranja: mayor contraste, carácter más técnico.
3. Editorial blanco/negro: sobrio, menos vínculo con la identidad catalana.

## Roadmap de desarrollo
| Entrega | Dependencia | Resultado verificable |
|---|---|---|
| Diseño y prototipo React | Revisión de esta maqueta | Landing y vistas navegables, móvil y teclado; separación explícita de demo |
| Auth y multiempresa | Contrato de permisos y selección de librería | Bootstrap, sesiones revocables, pertenencias y prueba de aislamiento entre dos tenants |
| Fichaje vertical | Auth y migraciones probadas | Entrada/pausa/salida, persistencia, idempotencia, revisión y concurrencia en DB real |
| Historial y correcciones | Eventos y estados | Original conservado, ajustes auditados y aprobación sin autoaprobación ordinaria |
| Reporting y piloto | Cómputo y revisiones | CSV/PDF reproducibles, medianoche/DST, entrega de resúmenes y restauración comprobada |
| PWA y Tauri | API estable | Instalación web, sin caché privada; bandeja e instaladores probados en Windows/Linux |
| Comercialización | Piloto validado | MFA, soporte, cuotas y retención; evaluar AWS y Expo mediante planes propios |

## Límites y arquitectura
Monolito modular Fastify; lógica de jornada en servidor, SQL parametrizado, restricciones por empresa y hechos append-only. React consume contratos compartidos y TanStack Query. No introducir proveedores cloud obligatorios. La maqueta no modifica el esquema ni los endpoints de producción.

## Siguiente paso tras revisión
Aprobar estructura y navegación de landing/empleado/administración; después escribir el plan técnico detallado de la primera entrega visual con archivos, interfaces, pruebas y pasos pequeños. Cada subsistema tendrá su propio plan. No comprometer fechas hasta medir el primer recorrido y cerrar auth.
