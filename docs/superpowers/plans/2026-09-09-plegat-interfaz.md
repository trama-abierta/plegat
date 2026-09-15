# Plegat interfaz inicial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track steps with checkboxes.

**Goal:** Convertir la maqueta aprobada en cuatro vistas React navegables y adaptables.
**Architecture:** Componentes de presentación separados por vista; navegación por hash y aviso de demo permanente. No hay mutaciones ni dependencia de backend para esta entrega visual.
**Tech Stack:** JavaScript, React 19, Vite 7, CSS, Vitest y Testing Library.
**Spec:** docs/superpowers/specs/2026-09-09-plegat-producto-design.md. Diseño aprobado por el usuario el 2026-09-09.

## Global Constraints
- JavaScript ESM y JSX; no TypeScript.
- Node >=22.14.0.
- Marfil #f4f2ea, verde tinta #203b32, oliva #aabb81 y arena #ded4bd.
- Datos ficticios identificados; ningún botón registra fichajes ni simula autenticación.
- Mantener README original, configuración local y cambios existentes.
- Implementar en /home/raul/dev/plegat por preferencia explícita del usuario; no existe repositorio Git y no se crean commits ni worktrees en esta entrega.

## Task 1: Navegación y vistas de la propuesta
**Files:** crear apps/frontend/src/App.jsx, views/{Landing,Personal,Admin,Roadmap}.jsx, componentes de ficha/estructura necesarios; modificar main.jsx, style.css e index.html.
**Interfaces:** App() sin props. Hash #landing, #personal, #admin, #plan; desconocido retorna landing. Enlaces con aria-current; panel activo contiene un único h1. La ficha de jornada reutilizada mantiene Pausar y Terminar jornada deshabilitados.

- [x] Escribir prueba de contrato de usuario en tests/ui/navigation.test.jsx. Código ejecutable de referencia en ese archivo: importa main.jsx, navega con enlaces reales y hashchange, comprueba vistas y acciones deshabilitadas.
- [x] Ejecutar `npm run test:ui`: fallo esperado por navegación ausente en el scaffold existente.
- [x] Implementar App con useState para hash y useEffect para escucha/limpieza de hashchange; enlaces nativos conservan historial del navegador. Separar las cuatro vistas conservando contenido de la maqueta aprobada.
- [x] Aplicar CSS adaptable a una columna en móvil, foco visible, tablas con caption y overflow local; no hacer clicables etiquetas de funciones pendientes.
- [x] Ejecutar `npm run test:ui`, `npm run lint`, `npm test`, `npm run build`: todos deben finalizar correctamente.

## Task 2: Revisión y entrega local
**Files:** GETTING_STARTED.md y este plan.
**Interfaces:** `npm run dev` mantiene el arranque original; `npm run test:ui` ejecuta los contratos DOM de presentación.
- [x] Revisar diferencia funcional respecto a la maqueta: navegación, copy, datos, límites, ausencia de peticiones de escritura y accesibilidad semántica.
- [x] Documentar comandos y alcance implementado frente al backend pendiente.
- [x] Arrancar Vite con localhost, verificar respuesta y abrir la primera versión en el navegador de la aplicación.

## Criterios de salida
Las cuatro vistas se recorren sin recarga completa, no se presentan datos reales, no existe escritura, el backend conserva sus tres pruebas y el build web funciona. La navegación desconocida vuelve a landing. Pruebas DOM no equivalen a una auditoría visual en navegador.

## Resultado
Implementación local verificada: navegación UI y salto accesible, tres pruebas backend, lint y build. Maqueta trasladada a vistas React; controles de fichaje deshabilitados. Revisión realizada por el coordinador tras agotarse la cuota del agente delegado; no se afirma revisión independiente. No se realizó QA visual automatizada ni despliegue externo.

## Siguiente slice funcional

El backend ya expone un vertical slice local de sesión demo, estado, historial, entrada/pausa/reanudación/salida idempotentes y resumen administrativo mediante `apps/backend/src/store.js` y `apps/backend/src/modules/attendance.js`. La store es temporal: la siguiente entrega debe reemplazarla por repositorio PostgreSQL y sesiones persistentes antes de un piloto.
