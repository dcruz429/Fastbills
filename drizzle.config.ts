// Maintenance hold: fail BEFORE reading connection configuration or credentials.
// No review-only declarations are promoted into the active schema by this file.
import { blockUnapprovedSchemaTooling } from "./preflight/rcm/tooling-guard";
export default blockUnapprovedSchemaTooling();
