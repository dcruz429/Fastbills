---
name: Replit server timezone — date range filter bug
description: The Replit runtime is America/New_York, so setHours() on a UTC-midnight date produces wrong results. Always use setUTCHours() for server-side date range end calculations.
---

# Problem
When a frontend sends `dateTo=2026-07-23` (a date-only string), Node.js parses it as UTC midnight: `2026-07-23T00:00:00.000Z`. Calling `d.setHours(23, 59, 59, 999)` then sets LOCAL hours (EDT = UTC-4), resulting in `2026-07-23T03:59:59.999Z` — only 4 AM UTC. Any call scheduled after 4 AM UTC is excluded from the "day" filter.

# Rule
Always use `setUTCHours(23, 59, 59, 999)` when extending a UTC-midnight date to end-of-day in server routes.

```typescript
// WRONG (local hours, broken on America/New_York server)
const d = new Date(dateTo as string);
d.setHours(23, 59, 59, 999);

// CORRECT
const d = new Date(dateTo as string);
d.setUTCHours(23, 59, 59, 999);
```

**Why:** Replit containers run with system timezone `America/New_York` (EDT = UTC-4 in summer). `setHours` uses the process local timezone, so the end-of-day cut-off shifts 4 hours earlier than intended.

**How to apply:** Any backend route that accepts a `dateTo` query param from an ISO date string must use `setUTCHours`. Check all date-range filters across all tracker routes.
