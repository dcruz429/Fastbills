---
name: Production API logging
description: Performance constraint for logging API responses containing large tracker datasets.
---

Do not log successful API response bodies. Log method, path, status, and duration; include only bounded error details for failed responses.

**Why:** Tracker endpoints can return thousands of records with long notes. Re-serializing and writing those bodies to deployment logs consumes substantial CPU, memory, and log I/O on every request.

**How to apply:** Keep request logging metadata-only for successful responses. If diagnostics require payload details, add narrowly scoped summaries such as counts or identifiers rather than full datasets.