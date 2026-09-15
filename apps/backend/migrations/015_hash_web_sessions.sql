CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE sessions SET id = encode(digest(id, 'sha256'), 'hex') WHERE id !~ '^[0-9a-f]{64}$';
