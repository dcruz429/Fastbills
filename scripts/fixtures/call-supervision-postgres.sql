-- Fabricated prerequisites only, loaded exclusively into a fresh local cluster.
-- These are NOT application migrations and must never target an existing DB.
CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, role TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE clinics (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE user_teams (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  team_id INTEGER NOT NULL REFERENCES teams(id)
);
CREATE TABLE scheduled_calls (
  id INTEGER PRIMARY KEY, patient_name TEXT NOT NULL, related_task_id INTEGER,
  department TEXT, assigned_user_id INTEGER REFERENCES users(id),
  created_by_user_id INTEGER REFERENCES users(id),
  scheduled_at TIMESTAMP NOT NULL DEFAULT '2026-11-13 09:00:00',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  call_reason TEXT NOT NULL DEFAULT 'Fabricated verification fixture',
  priority TEXT NOT NULL DEFAULT 'medium', call_status TEXT NOT NULL DEFAULT 'Scheduled',
  phone_number TEXT, notes TEXT, parent_call_id INTEGER, completed_at TIMESTAMP,
  cancelled_at TIMESTAMP, cancellation_reason TEXT, clinic TEXT, insurance TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE call_attempts (
  id INTEGER PRIMARY KEY, scheduled_call_id INTEGER NOT NULL REFERENCES scheduled_calls(id),
  attempted_by_user_id INTEGER REFERENCES users(id), started_at TIMESTAMP,
  ended_at TIMESTAMP, duration_seconds INTEGER, outcome TEXT NOT NULL,
  contact_person TEXT, notes TEXT, follow_up_required BOOLEAN NOT NULL DEFAULT false,
  next_scheduled_call_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE call_activity (
  id INTEGER PRIMARY KEY, scheduled_call_id INTEGER NOT NULL REFERENCES scheduled_calls(id),
  call_attempt_id INTEGER, actor_user_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL, old_values TEXT, new_values TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE patient_call_schedule (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  source_id INTEGER NOT NULL, department TEXT NOT NULL, patient_name TEXT,
  clinic TEXT, insurance TEXT, scheduled_date TEXT NOT NULL,
  original_date TEXT, daily_status TEXT, notes TEXT, call_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);
INSERT INTO users(id,username,full_name,role,active) VALUES
  (1,'fabricated_supervisor','Fabricated Supervisor','manager',true),
  (2,'fabricated_teammate','Fabricated Teammate','verifier',true),
  (3,'fabricated_outsider','Fabricated Outsider','verifier',true),
  (4,'fabricated_ungranted_manager','Fabricated Ungranted Manager','manager',true),
  (5,'fabricated_other_clinic','Fabricated Other Clinic Employee','verifier',true),
  (6,'fabricated_other_department','Fabricated Other Department Employee','biller',true),
  (7,'fabricated_unknown_membership','Fabricated Unknown Membership','verifier',true),
  (8,'fabricated_inactive','Fabricated Inactive Employee','verifier',false),
  (9,'fabricated_second_team','Fabricated Second Team Employee','verifier',true),
  (90,'fabricated_admin','Fabricated Administrator','admin',true),
  (91,'fabricated_second_admin','Fabricated Second Administrator','admin',true);
INSERT INTO clinics VALUES (10,'Fabricated Clinic A'), (20,'Fabricated Clinic B');
INSERT INTO teams VALUES (7,'Manager Team'), (8,'Fabricated Other Team');
-- Ordinary manager membership, even in "Manager Team", grants NO supervision.
INSERT INTO user_teams(user_id,team_id) VALUES (1,7),(2,7),(4,7),(5,7),(6,7),(8,7),(3,8),(9,8);
INSERT INTO scheduled_calls(id,patient_name,assigned_user_id,clinic,department) VALUES
  (123,'Fabricated Self Call',1,'Fabricated Clinic A','Verification'),
  (124,'Fabricated Team Call',2,'Fabricated Clinic A','Verification'),
  (125,'Fabricated Cross Team Call',3,'Fabricated Clinic A','Verification'),
  (126,'Fabricated Cross Clinic Call',5,'Fabricated Clinic B','Verification'),
  (127,'Fabricated Cross Department Call',6,'Fabricated Clinic A','Billing'),
  (128,'Fabricated Unknown Membership Call',7,'Fabricated Clinic A','Verification'),
  (129,'Fabricated Inactive Member Call',8,'Fabricated Clinic A','Verification'),
  (130,'Fabricated Missing Clinic Call',2,NULL,'Verification'),
  (131,'Fabricated Unknown Clinic Call',2,'Unknown Fabricated Clinic','Verification'),
  (132,'Fabricated Missing Department Call',2,'Fabricated Clinic A',NULL),
  (133,'Fabricated Unknown Department Call',2,'Fabricated Clinic A','Unrecognized'),
  (134,'Fabricated Unassigned Call',NULL,'Fabricated Clinic A','Verification'),
  (135,'Fabricated Second Team Call',9,'Fabricated Clinic A','Verification');
INSERT INTO call_attempts(id,scheduled_call_id,attempted_by_user_id,outcome,notes)
  SELECT id,id,assigned_user_id,'No Answer','Fabricated attempt only' FROM scheduled_calls;
INSERT INTO call_activity(id,scheduled_call_id,actor_user_id,event_type)
  SELECT id,id,assigned_user_id,'Fabricated activity only' FROM scheduled_calls;
INSERT INTO patient_call_schedule(id,user_id,source_id,department,patient_name,clinic,scheduled_date,call_id) VALUES
  (11,2,41,'Verification','Fabricated Allowed Schedule','Fabricated Clinic A','2026-11-13',124),
  (12,2,42,'Verification','Fabricated Linked Outsider Schedule','Fabricated Clinic A','2026-11-13',125),
  (13,2,43,'Verification','Fabricated Cross Clinic Schedule','Fabricated Clinic B','2026-11-13',124),
  (14,2,44,'Billing','Fabricated Cross Department Schedule','Fabricated Clinic A','2026-11-13',124),
  (15,3,45,'Verification','Fabricated Cross Team Schedule','Fabricated Clinic A','2026-11-13',125),
  (16,2,46,'Verification','Fabricated Linked Cross Clinic Schedule','Fabricated Clinic A','2026-11-13',126),
  (17,2,47,'Verification','Fabricated Unlinked Existing Schedule','Fabricated Clinic A','2026-11-13',NULL);
