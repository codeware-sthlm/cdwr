# CMS Permission Model

> **Source of truth for e2e permission tests.**
> Each scenario is identified by an ID (e.g. `[T-01]`) that test descriptions reference directly.

## User Types

The CMS has two independent role dimensions that combine to define effective permissions.

### `users.role` — system level

| Value         | Who                                                            |
| ------------- | -------------------------------------------------------------- |
| `system-user` | Full system access. No tenant membership required or expected. |
| `user`        | All other users. Must belong to at least one tenant workspace. |

### `tenants[].role` — per-membership level

| Value   | Who                                                                         |
| ------- | --------------------------------------------------------------------------- |
| `admin` | Can manage users within the workspace (create, edit tenants array, delete). |
| `user`  | Read and write content within the workspace. Cannot manage users.           |

### Effective user types

These three personas are what the tests exercise:

| Persona          | `users.role`  | `tenants[].role`    | Description                                     |
| ---------------- | ------------- | ------------------- | ----------------------------------------------- |
| **System user**  | `system-user` | —                   | Manages the whole platform. No tenant scope.    |
| **Tenant admin** | `user`        | `admin` (≥1 tenant) | Manages users and content within their tenants. |
| **Tenant user**  | `user`        | `user` (≥1 tenant)  | Creates and edits content. Cannot manage users. |

---

## How Access Is Determined

### Tenant API keys are read-only clients

External clients authenticate as the tenant itself (`Authorization: tenants API-Key …`). This is a
second identity type, and it is the one the multi-tenant plugin does **not** cover: the plugin adds
its tenant constraint only for identities from the `users` collection. Anything a collection leaves
to the Payload default (`Boolean(user)`) is therefore unscoped for a key — it reaches every tenant.

Every tenant-enabled collection must state its access explicitly:

- **Read** → `userOrApiKeyAccess()`: constrains the key to `tenant = itself` and, in host mode,
  verifies the request signature.
- **Create / update / delete / version history** → `userOnlyAccess()`: admin users only. Keys are
  read-only, so a leaked key cannot modify anything, not even its own tenant's content.
- The single exception is **creating a form submission**, which is what the key exists to do.

Keys are also denied on `users` and `tenants` (the latter holds every tenant's API key).

### Tenants collection

Only system users can create, update, or delete tenants. Read is restricted to the active tenant in tenant mode and denied to API keys.

### Users collection

- **Create**: system user or tenant admin (admin can only create users for their own tenants).
- **Read**: any authenticated **admin user**, constrained to users who share at least one tenant with the requester. System users see all. API keys are denied.
- **Update**: system user (all), tenant admin (users whose every tenant membership the admin controls), self (own profile only).
- **Delete**: system user (all), tenant admin (users in their tenants — cannot delete self).
- **Unlock**: system user or tenant admin.
- **`users.role` field**: create/update restricted to system users only. Tenant admins cannot escalate privileges.
- **`tenants[]` array**: tenant admins cannot assign users to tenants they do not administer, nor change roles in those tenants.

### Content collections (pages, posts, tours, places, categories, navigation, site-settings, tags, media, reusable-content, forms)

- **Read**: any authenticated user or valid tenant API key, scoped to the active tenant.
- **Create / update / delete**: admin users only, scoped to the active tenant in tenant mode. API keys are denied.
- **navigation / site-settings**: writes additionally require a system user or tenant admin. Tenant users are denied.
- **Version history (pages, posts, tours)**: admin users only — versions hold unpublished drafts.

Write scope follows read scope: in tenant mode a user with several memberships can only write inside
the running deployment's tenant, so they can never reach a document they are not allowed to read.

### Platform-owned collections (faq, platform-labels, stock-media)

Owned by the platform rather than a tenant, and deliberately **not** registered with the
multi-tenant plugin — every workspace reads the same documents.

- **Read**: any authenticated identity, including a tenant API key. Not tenant scoped, so a foreign
  key reading them is the designed behaviour rather than a leak.
- **Create / update / delete**: system users only. Tenant admins are denied.
- **Static files (stock-media)**: readable without a session. The images are served on public tour
  pages, so the file has to be reachable even though its document is not.

> These collections have no `tenant` field, so a tenant-scoped access helper does not deny the
> request — Payload rejects the query with `Cannot find field for path at tenant` and returns a
> **500**. The positive read assertions in `platform-owned.spec.ts` are what catch that.

### Form submissions

**Create** is reserved for tenant API keys — the `ensureTenant` hook needs that identity to populate
the required tenant field. **Read** uses `userOrApiKeyAccess`, so a key only sees its own tenant's
submissions. **Delete** is an admin user operation, and **update** is disabled by the form-builder
plugin.

Two admin-only endpoints back the submissions UI. `form-submissions-read` sets the unread marker;
because **update** is disabled it writes with `overrideAccess`, and authorizes itself instead — the
caller must be an admin user, and only ids that came back from a read under their own access and
workspace scope are written. `form-submissions-export` returns one form's submissions as CSV under
the caller's own access. Both reject tenant API keys outright.

### Multi-tenant cookie scoping (`payload-tenant`)

The `payload-tenant` cookie is read on **every API request** for plugin-managed content collections. Setting it to a specific tenant ID restricts all results to that tenant, even for users with multi-tenant access. This applies at the REST API level, not just the admin UI.

### Tenant-mode login restriction

After password auth, the `verifyTenantModeAccessHook` (afterLogin) checks that the user belongs to the active tenant when the server is running in tenant mode. Skipped for `system-user` and users with no tenant memberships. Users who fail this check receive a 403 before any session token is issued.

---

## Test Users

All users are seeded by `libs/shared/util/seed/src/lib/platform/platform.ts`.
Password for every seed user: **`dev`** (locally and in e2e; the seed sets it per environment).

| Constant      | Email               | Persona      | Tenants           | Primary test purpose                                |
| ------------- | ------------------- | ------------ | ----------------- | --------------------------------------------------- |
| `systemUser`  | `system@local.dev`  | System user  | none              | System-only operations; setup/teardown              |
| `tenantAdmin` | `titan@local.dev`   | Tenant admin | moon (admin)      | Core tenant admin permission tests                  |
| `tenantUser`  | `phobos@local.dev`  | Tenant user  | moon (user)       | Core tenant user permission tests                   |
| `multiAdmin`  | `black@local.dev`   | Tenant admin | moon+star (admin) | Multi-tenant admin; cookie-scoped content isolation |
| `multiUser`   | `iss@local.dev`     | Tenant user  | moon+star (user)  | Multi-tenant user; cookie-scoped content isolation  |
| `otherAdmin`  | `antares@local.dev` | Tenant admin | star (admin)      | No moon access — verifies cross-tenant denial       |

> **`otherAdmin` is the primary "no access" actor** for moon-scoped tests. They are a valid admin
> in a different tenant, so any denial is specifically about moon access, not about being unauthenticated.

---

## Permission Matrix

`✓` = allowed · `✗` = denied · `~` = partial (see notes)

### Tenants collection

| Scenario                | System user | Tenant admin                | Tenant user                 |
| ----------------------- | ----------- | --------------------------- | --------------------------- |
| [T-01] Create tenant    | ✓           | ✗                           | ✗                           |
| [T-02] Read tenant list | ✓           | ~ (own only in tenant mode) | ~ (own only in tenant mode) |
| [T-03] Update tenant    | ✓           | ✗                           | ✗                           |
| [T-04] Delete tenant    | ✓           | ✗                           | ✗                           |

### Users collection

| Scenario                                                | System user | Tenant admin                 | Tenant user                  |
| ------------------------------------------------------- | ----------- | ---------------------------- | ---------------------------- |
| [U-01] Create user                                      | ✓           | ✓ (own tenants only)         | ✗                            |
| [U-02] Read user list                                   | ✓ (all)     | ~ (shared-tenant users only) | ~ (shared-tenant users only) |
| [U-03] Update own profile                               | ✓           | ✓                            | ✓                            |
| [U-04] Update another user's basic fields (same tenant) | ✓           | ✓                            | ✓ (basic fields only)        |
| [U-04b] Change another user's tenant memberships        | ✓           | ✓ (own tenants)              | ✗                            |
| [U-05] Update user in non-admin tenant                  | ✓           | ✗                            | ✗                            |
| [U-06] Delete user (not self)                           | ✓           | ✓ (own tenants)              | ✗                            |
| [U-07] Delete self                                      | ✓           | ✗                            | ✗                            |
| [U-08] Set `users.role` to `system-user`                | ✓           | ✗                            | ✗                            |
| [U-09] Assign user to non-admin tenant                  | ✓           | ✗                            | ✗                            |
| [U-10] Read users outside own tenants                   | ✓           | ✗                            | ✗                            |

### Content collections (pages, posts, categories, etc.)

| Scenario                                                   | System user | Tenant admin | Tenant user | No moon access |
| ---------------------------------------------------------- | ----------- | ------------ | ----------- | -------------- |
| [C-01] Read moon content                                   | ✓           | ✓            | ✓           | ✗              |
| [C-02] Create moon content                                 | ✓           | ✓            | ✓           | ✗              |
| [C-03] Update navigation                                   | ✓           | ✓            | ✗           | ✗              |
| [C-04] Update site-settings                                | ✓           | ✓            | ✗           | ✗              |
| [C-05] Multi-tenant user restricted to moon in tenant mode | ✓           | ✓            | ✓           | —              |
| [C-06] Write to a document outside the active tenant       | ✗           | ✗            | ✗           | ✗              |

> **No moon access column:** All denials happen at login — `verifyTenantModeAccessHook` rejects
> users without moon membership before a session token is issued. See `auth.spec.ts`.
>
> **Defense-in-depth (C-02):** Even if login were bypassed, the multi-tenant plugin overrides any
> injected `tenant` body field with the cookie-derived value, so content can never land in a tenant
> the user doesn't own.
>
> **[C-05] note:** In tenant mode `userOrApiKeyAccess` returns `{ tenant: equals moonId }` for all
> authenticated users. The plugin AND's this with `{ tenant: in userTenantIds }`. Multi-tenant users
> (e.g. `multiAdmin` with moon+star) therefore only receive moon content — server-enforced,
> independent of the `payload-tenant` cookie.

### Platform-owned collections (faq, platform-labels, stock-media)

Shared across every workspace, so the API key columns are deliberately `✓` for reads — unlike
content, a foreign key is _supposed_ to see these.

| Scenario                                     | System user | Tenant admin | Tenant user | Any API key | Unauthenticated |
| -------------------------------------------- | ----------- | ------------ | ----------- | ----------- | --------------- |
| [P-01] Read a platform-owned collection      | ✓           | ✓            | ✓           | ✓ [P-04]    | ✗ [P-06]        |
| [P-02] Create / update / delete as an editor | —           | ✗            | ✗           | ✗ [P-05]    | ✗               |
| [P-03] Maintain labels as a system user      | ✓           | ✗            | ✗           | ✗           | ✗               |
| [P-06] Fetch a stock media **file**          | ✓           | ✓            | ✓           | ✓           | ✓               |

> **[P-03] uniqueness:** a label name is unique _within its type_, not globally — the same word can
> serve two vocabularies. Both halves of that are asserted.

### Tenant API keys

Exercised with tenant API keys rather than user sessions, since that is the identity external
clients present. `moon` is the deployment's own tenant, `star` is a foreign one. A denial for the
**own** key is the point: keys are read-only everywhere.

| Scenario                                | Moon API key | Star API key | Unauthenticated |
| --------------------------------------- | ------------ | ------------ | --------------- |
| [K-01] Read moon content                | ✓            | ✗            | ✗               |
| [K-02] Create / update / delete content | ✗            | ✗            | ✗               |
| [K-03] Read users / tenants             | ✗            | ✗            | ✗               |
| [K-04] Read version history             | ✗            | ✗            | ✗               |
| [F-01] Read a moon form submission      | ✓            | ✗            | ✗               |
| [F-02] Delete a moon form submission    | ✗            | ✗            | ✗               |
| [F-03] Mark a form submission read      | ✗            | ✗            | ✗               |
| [F-04] Export a form's submissions      | ✗            | ✗            | ✗               |
| Create a form submission (site route)   | ✓            | —            | —               |

---

## Implementation Notes

- All `[T-*]`, `[U-*]`, `[C-*]` tests are **API-level** (`page.request`, `{ navigate: false }`) — faster and more precise, no admin page load interference.
- `[K-*]` and `[F-*]` tests use tenant API keys on a plain request context instead of a user session, since that is how external clients authenticate. They must never share a context with `loginAs`, which sets an `Authorization` header on the whole browser context.
- Browser/UI tests that verify admin menu visibility or tenant selector behaviour live in `src/admin/`.
- `otherAdmin` (`antares@local.dev`) represents the "no moon access" column. Because login is denied in tenant mode, their role is exercised exclusively in `auth.spec.ts`.
- Cookie-scope tests (S-series) are only meaningful in host mode and are not part of this e2e suite.
