# FastbillsPH RCM legacy route clinic isolation audit (initial findings)

**Status: RELEASE BLOCKED.** The new RCM Task Board, assignment, approval, QA, SLA and productivity handlers have dedicated scope checks, but existing legacy APIs do not consistently enforce these constraints. The new role/clinic/department assignments are **not a system-wide security boundary yet**. Do not merge this feature to `main` or deploy as multi-clinic isolation.

## Findings verified by source inspection

| Severity | Entry point | Evidence (server/routes.ts on feature branch) | Problem |
| --- | --- | --- | --- |
| Critical | `GET /api/tasks/:taskId` | ~1201-1205 | `requireAuth` then `storage.getTask(id)` with **no** clinic/department check on the fetched record |
| Critical | `GET /api/tasks?workload=true` | ~938-947 | Any authenticated caller can set `workload=true` to bypass verifier/biller assignee filtering and return `getAllTasks()`; other roles receive all tasks directly |
| High | `GET /api/tasks/:taskId/activity` | ~1207-1210 | Unscoped activity retrieval by numeric task ID |
| Critical | `GET /api/denials/:id` | ~1406-1410 | Authenticated ID lookup without clinic scope |
| High | `GET /api/denials?workload=true` | ~1233-1247 | Global dataset returned on user-supplied workload flag |
| Critical | `GET /api/checks/:id` | ~3257-3261 | Individual check lookup has no checks-specific or clinic scope |
| High | `GET /api/checks?workload=true` | ~3098-3107 | The user-supplied workload flag bypasses role check and global checks are returned |
| Critical | `GET /api/files/:id` | ~2854-2864 | Authenticated file download by ID without verifying attachment ownership/access to parent record |
| High | `GET /api/patient-overview` | ~918-929 | Search explicitly allows all signed-in roles and does not filter to RCM clinic scopes before querying |
| High | `GET /api/users` | ~604-607 | Every authenticated user may enumerate all account profile fields except passwords; scope/field-minimization required |

**These are source-level findings.** They do not assert that every route was exploit-tested or that the routes are exposed to the public internet. The browser/HTTP functional tests cover **new RCM APIs**, not legacy authorization.

## Safe synthetic reproduction

```bash
DATABASE_URL="$RCM_SYNTHETIC_URL" npx tsx scripts/rcm-legacy-scope-probe.ts
```
The script uses the real synthetic manager login, confirms the new board excludes Harbor Demo Clinic, and tests whether the legacy task detail and workload routes expose Harbor's synthetic record. Prints **only statuses and yes/no**, not identifiable records. A confirmed exposure intentionally returns exit code **2**, because it is a release blocker.

## Required remediation before release

1. Build a **centralized, server-enforced clinic/department authorization layer** for every legacy resource family and every operation: list, detail, activity, attachments, create/update/delete, bulk edit/delete, imports/exports, transfers, cross-tracker conversions, search, notifications, and reports.
2. Resolve text clinic names to one exact clinic ID; reject unknown/ambiguous cases, and reject NULL clinic IDs for non-admins. Require explicit `checks.read` for checks content.
3. Enforce the policy on the server **before** fetching or mutating protected data; prevent untrusted query parameters such as `workload=true` from granting broader access. Verify assignment target scope independently of actor scope.
4. Minimize profile and file metadata for ordinary employees. Bind files to allowed parent resources and validate every download.
5. Run negative cross-clinic, cross-department, inactive-account, impersonation, and ID enumeration tests with real sessions and synthetic records across all affected routes.
6. Audit remaining ~155 legacy routes and auxiliary modules; spot findings above are **not exhaustive**. Repair any confirmed gap before enabling multi-clinic isolation in production.
7. Keep CI release-gated on security regressions; reconcile pre-existing TypeScript errors and npm audit alerts before merge.

**Production and original Development databases were not inspected or modified by this audit.**
