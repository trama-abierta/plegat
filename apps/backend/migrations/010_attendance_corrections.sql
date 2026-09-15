CREATE TABLE attendance_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  employee_id text NOT NULL REFERENCES employees(id),
  requested_by text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('create_workday', 'edit_workday', 'modify', 'delete', 'delete_workday')),
  event_id uuid REFERENCES attendance_events(id),
  original_time timestamptz,
  proposed_time timestamptz,
  reason text NOT NULL,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  review_comment text,
  withdrawn_by text REFERENCES users(id),
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_change_requests_tenant_status ON attendance_change_requests (tenant_id, status, created_at DESC);
CREATE TABLE attendance_change_items (
  request_id uuid NOT NULL REFERENCES attendance_change_requests(id) ON DELETE CASCADE,
  event_id uuid REFERENCES attendance_events(id),
  relation text NOT NULL CHECK (relation IN ('primary', 'affected', 'proposed')),
  original_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (request_id, event_id, relation)
);
CREATE TABLE attendance_workday_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id),
  employee_id text NOT NULL REFERENCES employees(id),
  work_date date NOT NULL,
  source_request_id uuid NOT NULL UNIQUE REFERENCES attendance_change_requests(id),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date, status)
);
CREATE TABLE attendance_projection_events (
  projection_id uuid NOT NULL REFERENCES attendance_workday_projections(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  type text NOT NULL CHECK (type IN ('clock_in', 'break_start', 'break_end', 'clock_out')),
  occurred_at timestamptz NOT NULL,
  source_event_id uuid REFERENCES attendance_events(id),
  PRIMARY KEY (projection_id, position)
);
GRANT SELECT, INSERT, UPDATE ON attendance_change_requests, attendance_change_items, attendance_workday_projections, attendance_projection_events TO plegat_app;
