INSERT INTO oauth_clients (id, name, type, redirect_uris, allowed_scopes, status)
VALUES ('plegat-mobile', 'Plegat Mobile', 'public', '["plegat://oauth/callback"]'::jsonb, '["openid","profile","email"]'::jsonb, 'active')
ON CONFLICT (id) DO NOTHING;
