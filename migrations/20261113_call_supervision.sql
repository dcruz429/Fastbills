-- PREPARATORY ONLY. Requires explicit approval before applying to any database.
-- No defaults/backfill: existing managers receive NO supervisory grants.
BEGIN;
CREATE TABLE rcm_call_supervisors (
  manager_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  granted_by INTEGER NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_user_id, team_id)
);
CREATE INDEX rcm_call_supervisors_team_idx ON rcm_call_supervisors(team_id);
COMMIT;
