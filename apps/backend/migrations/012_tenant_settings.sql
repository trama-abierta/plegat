CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id text PRIMARY KEY REFERENCES tenants(id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
