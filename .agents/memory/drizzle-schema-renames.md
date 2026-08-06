---
name: Drizzle schema renames
description: Development database behavior when changing existing Drizzle column names.
---

Drizzle push detects a renamed column as a conflict and asks for interactive confirmation. In the non-TTY agent environment, both normal and force push can stop before applying the change.

**Why:** Applying an optional rename through ad hoc SQL or startup DDL would bypass the project’s schema workflow and could leave development and publish-time schemas inconsistent.

**How to apply:** Prefer preserving an already-applied column name for additive work. If a true rename is required, use an explicitly supported interactive/publish migration path rather than inventing a runtime migration.