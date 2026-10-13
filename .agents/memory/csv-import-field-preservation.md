---
name: Optional CSV field preservation
description: Distinguish omitted optional columns from explicit blank values when extending tracker CSV imports.
---

When adding an optional tracker field, imports that omit its column must preserve the existing value on matching records. An explicitly blank imported field may clear it.

**Why:** Older CSV templates cannot contain newly introduced columns. Coercing an omitted date field to null silently erases values already entered through the UI.

**How to apply:** Check field presence before coercing newly added optional values during imports. Leave omitted fields out of update payloads; allow new records to use the schema's nullable/default value. Test omitted, populated, and explicitly blank cases.
