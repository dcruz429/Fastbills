/** Deliberate maintenance hold, with NO environment-variable bypass. */
export function blockUnapprovedSchemaTooling(): never {
  throw new Error("SCHEMA TOOLING BLOCKED: SQL-owned RCM tables are under DEVELOPMENT preflight review. No connection configuration was loaded. Review preflight/rcm/README.md; metadata access and schema changes require separate authorization.");
}
