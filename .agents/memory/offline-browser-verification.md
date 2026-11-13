---
name: Offline browser verification constraints
description: Test tooling limitation observed when verifying the calendar without live services.
---

Do not fall back to a running application when a security-verification request requires fully isolated browser checks.

**Why:** The testing skill's specialized subagent kind was rejected as unsupported by the available callback in this environment. Browser verification was still possible locally with intercepted synthetic traffic, without relaxing the user's isolation requirements.

**How to apply:** Recheck available tooling rather than assuming this limitation is permanent. If the specialized tester is unavailable, use local Playwright with every request intercepted, no server listener, no real sessions, and no database-backed fixtures. Never reinterpret a tooling limitation as permission to access live data.
