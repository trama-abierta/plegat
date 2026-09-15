CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  time_zone text NOT NULL DEFAULT 'Europe/Madrid',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE employees (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE TABLE attendance_states (
  employee_id text PRIMARY KEY REFERENCES employees(id),
  status text NOT NULL CHECK (status IN ('outside', 'working', 'on_break')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL REFERENCES employees(id),
  type text NOT NULL CHECK (type IN ('clock_in', 'break_start', 'break_end', 'clock_out')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  sequence integer NOT NULL CHECK (sequence > 0),
  idempotency_key text NOT NULL,
  UNIQUE (employee_id, idempotency_key),
  UNIQUE (employee_id, sequence)
);
CREATE INDEX attendance_events_employee_time ON attendance_events (employee_id, occurred_at);
INSERT INTO tenants (id, name) VALUES ('demo-tenant', 'Taller Tramuntana') ON CONFLICT DO NOTHING;
INSERT INTO employees (id, tenant_id, name, email) VALUES ('demo-employee', 'demo-tenant', 'Laia Soler', 'laia@plegat.local') ON CONFLICT DO NOTHING;
INSERT INTO attendance_states (employee_id, status, revision) VALUES ('demo-employee', 'outside', 0) ON CONFLICT DO NOTHING;
