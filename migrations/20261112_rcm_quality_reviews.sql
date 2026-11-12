-- Staging-only additive quality review ledger. Never replaces task_activity.
BEGIN;
CREATE TABLE IF NOT EXISTS rcm_quality_reviews (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source TEXT NOT NULL CHECK(source IN ('tasks')),
 record_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 reviewer_id INTEGER NOT NULL REFERENCES users(id),
 reviewed_assignee_id INTEGER REFERENCES users(id),
 department_key TEXT NOT NULL,
 clinic_id INTEGER NOT NULL REFERENCES clinics(id),
 verdict TEXT NOT NULL CHECK(verdict IN ('passed','needs_correction')),
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rcm_quality_review_lookup_idx ON rcm_quality_reviews(source,record_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rcm_quality_review_reviewer_idx ON rcm_quality_reviews(reviewer_id,created_at DESC);
COMMIT;
