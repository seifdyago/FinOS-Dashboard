---
name: FinOS platform extension
description: Durable architecture convention for extending the FinOS AI dashboard.
---

Extend the existing FinOS AI application in place. New operational modules should use the shared platform context and existing routes/components rather than introducing duplicate page systems, layouts, or local data stores.

**Why:** The product is intentionally one connected operations workspace: transactions, customers, merchants, reports, analytics, notifications, profile, settings, search, and the AI assistant must reflect the same workspace changes across navigation and reloads.

**How to apply:** Before adding a feature, inspect the current route and shared state first. Add only missing behavior, preserve the dark FinOS visual system, and persist workspace-owned mock data through the existing local-storage-backed platform state until a backend is introduced.