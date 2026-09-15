// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminSection from "../../apps/frontend/src/views/AdminSection.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("admin records loads tenant attendance, filters it and opens its audit detail", async () => {
  const row = {
    id: "employee-1:2026-09-14",
    date: "2026-09-14",
    employeeId: "employee-1",
    employee: { id: "employee-1", name: "Laia Soler", email: "laia@example.test" },
    status: "pending_review",
    clockIn: "2026-09-14T06:00:00.000Z",
    clockOut: "2026-09-14T14:30:00.000Z",
    workedMs: 8 * 60 * 60 * 1000,
    breakMs: 30 * 60 * 1000,
    eventCount: 4,
    pendingRequestCount: 1,
  };
  const detail = {
    ...row,
    breaks: [{ start: "2026-09-14T10:00:00.000Z", end: "2026-09-14T10:30:00.000Z", durationMs: 30 * 60 * 1000 }],
    originalEvents: [
      { id: "in", type: "clock_in", occurredAt: "2026-09-14T06:00:00.000Z" },
      { id: "out", type: "clock_out", occurredAt: "2026-09-14T14:00:00.000Z" },
    ],
    effectiveEvents: [
      { id: "in", type: "clock_in", occurredAt: "2026-09-14T06:00:00.000Z" },
      { id: "out", type: "clock_out", occurredAt: "2026-09-14T14:30:00.000Z", derivedFromRequestId: "request-1" },
    ],
    requests: [{ id: "request-1", kind: "modify", status: "pending", reason: "Salida correcta", createdAt: "2026-09-14T15:00:00.000Z" }],
  };

  vi.stubGlobal("fetch", vi.fn(async (url) => {
    if (url === "/api/v1/me") return new Response(JSON.stringify({ tenant: { id: "tenant-1", name: "Taller Demo" } }), { headers: { "content-type": "application/json" } });
    if (url.includes("/attendance/employee-1/2026-09-14")) return new Response(JSON.stringify(detail), { headers: { "content-type": "application/json" } });
    if (url.includes("/attendance")) return new Response(JSON.stringify({ rows: [row], total: 1, page: 1, pageSize: url.includes("pageSize=100") ? 100 : 20 }), { headers: { "content-type": "application/json" } });
    return new Response(null, { status: 404 });
  }));

  render(<MemoryRouter><AdminSection section="Registros" /></MemoryRouter>);

  await waitFor(() => expect(screen.getByRole("cell", { name: "Laia Soler" })).toBeTruthy());
  expect(screen.getByText("Pendiente de revisión")).toBeTruthy();
  expect(screen.getByText(/1 registro/)).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar registros" }), { target: { value: "laia" } });
  fireEvent.click(screen.getByRole("button", { name: /Ver detalle de Laia Soler/ }));

  const dialog = await screen.findByRole("dialog", { name: /Detalle del registro/ });
  expect(dialog.textContent).toContain("Eventos originales");
  expect(dialog.textContent).toContain("Eventos efectivos");
  expect(dialog.textContent).toContain("Salida correcta");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("page=1"), expect.anything());
});
