-- Phase 1 additive access-control schema for existing FastBills PostgreSQL.
-- Review and back up database before applying. No existing tables altered.
-- Existing users.id / clinics.id and session login remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS rcm_roles (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rcm_role_permissions (
  role_slug TEXT NOT NULL REFERENCES rcm_roles(slug) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  PRIMARY KEY (role_slug, permission_key)
);
CREATE TABLE IF NOT EXISTS rcm_user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_slug TEXT NOT NULL REFERENCES rcm_roles(slug) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_slug)
);
CREATE TABLE IF NOT EXISTS rcm_user_permission_overrides (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);
CREATE TABLE IF NOT EXISTS rcm_user_departments (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_key TEXT NOT NULL,
  PRIMARY KEY (user_id, department_key)
);
CREATE TABLE IF NOT EXISTS rcm_user_clinics (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id INTEGER NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, clinic_id)
);
CREATE TABLE IF NOT EXISTS rcm_access_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rcm_access_audit_subject_idx ON rcm_access_audit(subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rcm_user_departments_key_idx ON rcm_user_departments(department_key, user_id);
CREATE INDEX IF NOT EXISTS rcm_user_clinics_id_idx ON rcm_user_clinics(clinic_id, user_id);
COMMIT;
