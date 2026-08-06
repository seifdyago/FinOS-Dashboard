---
name: FinOS platform extension
description: Durable architecture convention for extending the FinOS AI dashboard.
---

Extend the existing FinOS AI application in place. New operational modules should use the shared platform context and existing routes/components rather than introducing duplicate page systems, layouts, or local data stores. Workspace-owned state must be keyed by the active tenant id. AI employee departments should be represented as roster records and shared workspace panels, not separate route systems.

**Why:** The product is intentionally one connected operations workspace: transactions, customers, merchants, reports, analytics, notifications, profile, settings, search, and the AI assistant must reflect the same workspace changes across navigation and reloads, while different companies must never see each other’s state.

**How to apply:** Before adding a feature, inspect the current route and shared state first. Add only missing behavior, preserve the dark FinOS visual system, and persist workspace-owned mock data through the existing tenant-keyed local-storage platform state until a backend is introduced. Keep one-time legacy migration limited to the original Orbit demo tenant. Extend the existing employee builder and profile tabs when adding departments.