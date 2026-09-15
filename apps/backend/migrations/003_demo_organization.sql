INSERT INTO employees (id, tenant_id, name, email) VALUES
  ('demo-employee-2', 'demo-tenant', 'Marc Vila', 'marc@plegat.local'),
  ('demo-employee-3', 'demo-tenant', 'Júlia Roca', 'julia@plegat.local'),
  ('demo-employee-4', 'demo-tenant', 'Pol Costa', 'pol@plegat.local')
ON CONFLICT DO NOTHING;
INSERT INTO attendance_states (employee_id, status, revision)
SELECT id, 'outside', 0 FROM employees WHERE tenant_id = 'demo-tenant'
ON CONFLICT DO NOTHING;
