// Intentionally no imports, environment reads, DB clients, or bypass flags.
console.error("SCHEMA PUSH BLOCKED: db:push cannot apply the prepared supervision migration. RCM SQL/Drizzle ownership is under review. See preflight/rcm/README.md. No database connection was attempted.");
process.exitCode = 2;
