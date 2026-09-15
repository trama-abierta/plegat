ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_unique ON employees (user_id) WHERE user_id IS NOT NULL;
UPDATE employees SET user_id = 'demo-tenant-admin' WHERE id = 'demo-employee' AND user_id IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = 'demo-tenant-admin');
GRANT SELECT, INSERT, UPDATE ON employees TO plegat_app;
