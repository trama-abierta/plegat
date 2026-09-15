// @vitest-environment jsdom
import { test, expect } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";

test("functional journey navigation records an entry and supports direct routes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => options.method
    ? new Response(JSON.stringify({ event: { id: '1', type: 'clock_in', occurredAt: '2026-09-09T08:00:00Z' }, state: { status: 'working', revision: 1 } }), { headers: { 'content-type': 'application/json' } })
    : new Response(url.endsWith('/api/v1/me') ? JSON.stringify({ user: { name: 'Demo Admin', email: 'admin@example.test' }, tenant: { name: 'Demo' }, membership: { role: 'tenant_admin' } }) : url.includes('admin/summary') ? JSON.stringify({ tenant: { name: 'Demo' }, employees: [] }) : JSON.stringify({ events: [], state: { status: 'outside', revision: 0 } }), { headers: { 'content-type': 'application/json' } });
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState({}, '', '/');
  sessionStorage.removeItem('plegat_authenticated');
  localStorage.setItem('plegat_demo_attendance', JSON.stringify({ events: [], state: { status: 'outside', revision: 0 } }));
  await import("../../apps/frontend/src/main.jsx");
  await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());
  window.history.pushState({}, '', '/personal');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() => expect(window.location.pathname).toBe("/personal"));
  await waitFor(() => expect(screen.getByRole("button", { name: /Registrar entrada/i }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: /Registrar entrada/i }));
  await waitFor(() => expect(screen.getAllByRole("status")[0].textContent).toMatch(/confirmado|guardado/i));
  expect(screen.getByRole("button", { name: /Terminar jornada/i }).disabled).toBe(false);
  fireEvent.click(
    screen.getByRole("link", { name: "ADMIN", exact: true }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /El equipo/i, level: 1 }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("link", { name: "Saltar al contenido" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(window.location.pathname).toBe("/admin");
  await waitFor(() => expect(document.activeElement.id).toBe("content"));
  expect(
    screen.getByRole("heading", { name: /El equipo/i, level: 1 }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Demo Admin/i }));
  fireEvent.click(screen.getByRole("button", { name: /Cerrar sesión/i }));
  await waitFor(() => expect(window.location.pathname).toBe("/"));
  expect(screen.getByRole("heading", { name: /La jornada clara/i })).toBeTruthy();
  window.history.pushState({}, '', '/personal');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() => expect(screen.getByRole("heading", { name: /Bon dia, Laia/i })).toBeTruthy());
  window.history.pushState({}, '', '/plan');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /De una buena base/i }),
    ).toBeTruthy(),
  );
  window.history.pushState({}, '', '/unknown');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /La jornada clara/i }),
    ).toBeTruthy(),
  );
  expect(document.body.textContent).toMatch(/datos ficticios/i);
  globalThis.fetch = originalFetch;
});
