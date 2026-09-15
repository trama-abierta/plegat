CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  platform_role text CHECK (platform_role IN ('platform_admin', 'support', 'platform_user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_single_platform_admin ON users (platform_role) WHERE platform_role = 'platform_admin';

CREATE TABLE memberships (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('tenant_admin', 'employee')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'));
UPDATE tenants SET slug = 'demo-textil-mediterranea' WHERE id = 'demo-tenant' AND slug IS NULL;
ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX tenants_slug_unique ON tenants (slug);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_active ON sessions (user_id, expires_at);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_time ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX audit_log_actor_time ON audit_log (actor_user_id, occurred_at DESC);

INSERT INTO users (id, email, name, password_hash, platform_role)
VALUES ('demo-platform-admin', 'admin@plegat.local', 'Plegat Platform Admin', 'scrypt$demo$replace-on-bootstrap', 'platform_admin')
ON CONFLICT (email) DO NOTHING;
INSERT INTO users (id, email, name, password_hash)
VALUES ('demo-tenant-admin', 'admin@demo.plegat.local', 'Administración Demo', 'scrypt$demo$replace-on-bootstrap')
ON CONFLICT (email) DO NOTHING;
INSERT INTO memberships (user_id, tenant_id, role)
SELECT 'demo-tenant-admin', 'demo-tenant', 'tenant_admin'
WHERE EXISTS (SELECT 1 FROM users WHERE id = 'demo-tenant-admin')
  AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = 'demo-tenant-admin' AND tenant_id = 'demo-tenant');
