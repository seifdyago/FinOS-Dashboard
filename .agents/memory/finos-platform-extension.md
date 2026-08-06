---
name: FinOS platform extension
description: Durable architecture convention for extending the FinOS AI dashboard.
---

Extend the existing FinOS AI application in place. New operational modules should use the shared platform context and existing routes/components rather than introducing duplicate page systems, layouts, or local data stores. Workspace-owned state must be keyed by the active tenant id. AI employee departments should be represented as roster records and shared workspace panels, not separate route systems.

**Why:** The product is intentionally one connected operations workspace: transactions, customers, merchants, reports, analytics, notifications, profile, settings, search, and the AI assistant must reflect the same workspace changes across navigation and reloads, while different companies must never see each other’s state.

**How to apply:** Before adding a feature, inspect the current route and shared state first. Add only missing behavior, preserve the dark FinOS visual system, and persist workspace-owned mock data through the existing tenant-keyed local-storage platform state until a backend is introduced. Keep one-time legacy migration limited to the original Orbit demo tenant. Extend the existing employee builder and profile tabs when adding departments. Keep read-focused employee details distinct from operational workspace actions.

The database foundation uses UUID primary keys for persisted users and employees, while employee records retain an organization-scoped `employee_key` that maps to the existing frontend `Employee.id`. This preserves the current roster contract while allowing identical employee keys in different organizations.

**Why:** The frontend roster IDs are tenant-local stable identifiers, so making them globally unique database primary keys would prevent the same AI workforce template from being reused across organizations.

**How to apply:** Database adapters should map `employee_key` back to frontend `Employee.id`, and organization-scoped repositories must always filter by `organization_id` before resolving employee or department records.

Company onboarding should create one organization and its initial admin user transactionally, then expose the organization through the existing `Company`/tenant shape and localStorage-backed session until real authentication is introduced.

**Why:** The current dashboard and PlatformProvider already depend on a persisted active tenant and tenant-scoped workspace state; onboarding must establish that same boundary without introducing a parallel company or session system.

**How to apply:** Derive the company domain from the admin email, enforce organization uniqueness at the database boundary, and persist only the returned Company-compatible tenant plus admin profile into the existing keys before entering the current dashboard.

Subscription access is organization-scoped through one subscription record and static plan rules; plans gate the shared employee roster rather than creating plan-specific employee models.

**Why:** Basic and Premium are access entitlements over the same AI workforce, so duplicating employees would split identity, permissions, and future roster updates.

**How to apply:** Resolve access from subscription status and plan, match Basic by stable employee key or role label, let Premium unlock the shared roster/departments/advanced access, and deny inactive or unknown plans.

Knowledge documents are organization-owned records with an optional foreign key to the existing persisted employee UUID; employee-key lookup must resolve within the same organization before association.

**Why:** The database employee UUID is the canonical persisted identity, while `employee_key` is tenant-local frontend compatibility data; using both correctly prevents duplicate employee models and cross-tenant document links.

**How to apply:** Filter every document read by `organization_id`, allow unassigned documents for the organization, allow assigned documents only to the matching employee scope, and reuse subscription `manage:knowledge` access for management checks.

Company file uploads reuse `knowledge_documents` as metadata records; binary content lives in private Replit App Storage behind organization-scoped object paths and presigned URLs, while uploader ownership uses the existing organization-scoped user.

**Why:** The project’s sidecar signed-URL flow supports private browser-direct uploads without introducing multipart handling, a second file table, or a storage SDK runtime.

**How to apply:** Validate PDF, DOCX, CSV, XLS/XLSX, and text metadata before signing uploads, verify object existence before metadata finalization, issue private download URLs only after organization authorization, and keep every read/write organization-scoped.