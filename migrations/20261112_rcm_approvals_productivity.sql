-- Additive, staging-first RCM approval and productivity configuration.
BEGIN;
CREATE TABLE IF NOT EXISTS rcm_task_approvals (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 requested_by INTEGER NOT NULL REFERENCES users(id),
 requested_assignee_id INTEGER REFERENCES users(id),
 expected_assignee_id INTEGER REFERENCES users(id),
 risk_level TEXT NOT NULL CHECK (risk_level IN ('high','critical')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','consumed')),
 reviewed_by INTEGER REFERENCES users(id),
 review_note TEXT,
 requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reviewed_at TIMESTAMPTZ,
 consumed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS rcm_task_approvals_one_pending_idx
  ON rcm_task_approvals(task_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS rcm_task_approvals_task_status_idx
  ON rcm_task_approvals(task_id,status,requested_at DESC);
CREATE TABLE IF NOT EXISTS rcm_productivity_weights (
 department_key TEXT PRIMARY KEY,
 weight NUMERIC(8,2) NOT NULL CHECK(weight >= 0 AND weight <= 100),
 updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO rcm_productivity_weights(department_key,weight) VALUES
 ('Verification',1.00),('Billing',1.25),('Posting',0.75),('Collections',1.50),
 ('Denials',2.00),('Arbitration',2.50),('Checks',0.75),
 ('Case Management / RTP',1.50),('Closed',0.75)
ON CONFLICT(department_key) DO NOTHING;
COMMIT;
