# Database Quality Audit & Improvement Plan

> Audit of the **actual** schema (`schema.sql`, extracted from live PostgreSQL 16.6).
> Findings reference real tables/columns only. Recommendations are clearly marked as
> *not yet present*.

---

## 1. Quality Scores

| Dimension | Score | One-line rationale |
|-----------|------:|--------------------|
| **Schema Design** | **78 / 100** | Clean ownership model, good cascades; weakened by string-typed enums, JSON-in-text, and missing join uniqueness. |
| **Performance** | **74 / 100** | The critical `monitor_logs(monitor_id, checked_at)` index exists; but redundant single-column PK indexes and several un-indexed FKs remain. |
| **Scalability** | **62 / 100** | `monitor_logs` grows unbounded with no partitioning or retention; `uptime_percentage` recomputed by full COUNT each check. |
| **Security** | **80 / 100** | Passwords + API keys are hashed (bcrypt), audit trail preserved on user delete; loses points for no CHECK constraints and plaintext webhook/2FA secrets at rest. |

*Overall: solid, production-capable schema for an MVP; the gaps below are what separate it
from enterprise-grade.*

---

## 2. Normalization Issues

1. **String-typed enumerations (1NF/domain integrity).**
   `users.role`, `users.subscription_plan`, `monitors.monitor_type`,
   `monitors.current_status`, `incidents.incident_status`, `notifications.notification_type`,
   `team_members.role` are free `varchar` with no `CHECK` or enum type. A typo (`'htttp'`,
   `'Up'`) is silently accepted.
   **Fix:** native `ENUM` types or `CHECK (... IN (...))` constraints.

2. **Booleans/numbers stored as strings.**
   `monitors.uptime_percentage varchar(10)` holds a number as text (`'100.00'`), preventing
   numeric comparison/aggregation. (Note: `users.is_verified` was already corrected from
   `varchar` → `boolean` in migration 004 — apply the same treatment here.)
   **Fix:** `numeric(5,2)`.

3. **JSON stored in `text` columns.**
   `monitors.custom_headers`, `api_keys.permissions`, `webhook_endpoints.events`,
   `maintenance_windows.affected_monitors`, `audit_logs.details`, `webhook_deliveries.payload`.
   **Fix:** `jsonb` for validation, indexing (GIN) and querying.

4. **Soft relationship hidden in JSON.**
   `maintenance_windows.affected_monitors` is a JSON array of monitor IDs — a many-to-many
   relationship with no referential integrity. Deleting a monitor leaves dangling IDs.
   **Fix:** a `maintenance_window_monitors(window_id, monitor_id)` join table with FKs.

---

## 3. Missing Foreign Keys / Integrity

- **No `UNIQUE(org_id, user_id)` on `team_members`** → the same user can be added to an
  organization multiple times. Add a composite unique constraint.
- **`team_members.invited_by`** has an FK but **no `ON DELETE` rule** (defaults to NO ACTION) —
  deleting an inviter will be blocked. Consider `ON DELETE SET NULL`.
- **`audit_logs.resource_id`** is a bare integer with no FK (polymorphic by design) — acceptable,
  but means no DB-level integrity for audit targets.

---

## 4. Missing / Sub-optimal Indexes

> Every `*_id` foreign key that is filtered or joined should be indexed. Several are not.

| Table | Missing index | Why |
|-------|---------------|-----|
| `monitors` | `(user_id)` | Dashboard lists monitors per user — currently a seq scan. |
| `notifications` | `(user_id)` | Alert dispatch fetches a user's channels. |
| `status_pages` | `(user_id)` | |
| `maintenance_windows` | `(user_id)`, and `(starts_at, ends_at)` | The engine queries active windows by time range on every tick. |
| `alert_rules` | `(user_id)`, `(monitor_id)` | |
| `webhook_endpoints` | `(user_id)` | Delivery lookup per user. |
| `webhook_deliveries` | `(endpoint_id)` | Delivery history per endpoint. |
| `team_members` | `(org_id)`, `(user_id)` | Membership lookups. |
| `incidents` | `(monitor_id)` covered; consider partial `WHERE incident_status='ongoing'` | Open-incident lookup. |

**Redundant indexes to drop:** the ORM created single-column `ix_<table>_id` indexes on
`id` for `alert_rules`, `api_keys`, `audit_logs`, `maintenance_windows`, `organizations`,
`team_members`, `webhook_endpoints`, `webhook_deliveries`. The PRIMARY KEY already provides a
unique index on `id`, so these are pure overhead on writes. **Drop them.**

---

## 5. Performance Problems

1. **`monitor_logs` unbounded growth.** ~1 row / monitor / interval (a 5-min monitor ≈ 288
   rows/day). No retention or partitioning.
   **Fix:** range-partition by `checked_at` (monthly) and/or a retention job deleting rows
   older than the 30-day uptime window. *(Note: a retention job was discussed but not yet
   implemented.)*

2. **Uptime recomputed by full COUNT on every check.** `_recalculate_uptime()` runs two
   `COUNT(*)` over a 30-day window of `monitor_logs` per check.
   **Fix:** maintain a rolling aggregate table, or use a TimescaleDB continuous aggregate.

3. **No covering/partial indexes** for the most common predicates (e.g. ongoing incidents).

---

## 6. Security Concerns

- ✅ **Good:** `password_hash` is bcrypt; `api_keys.key_hash` stores a bcrypt hash with only a
  display `key_prefix`; `audit_logs` survive user deletion (`SET NULL`).
- ⚠️ **Plaintext secrets at rest:** `webhook_endpoints.secret` (HMAC key) and
  `users.totp_secret` are stored unencrypted. Encrypt at rest (pgcrypto / app-level KMS).
- ⚠️ **No `CHECK` constraints** to enforce valid statuses/roles/intervals (e.g.
  `interval > 0`, `expected_status_code BETWEEN 100 AND 599`).
- ⚠️ **No row-level security** — multi-tenant isolation is enforced only in application code.
  Consider Postgres RLS as defense-in-depth.

---

## 7. Data Consistency Issues

- `monitors.uptime_percentage` as string can drift from the truth in `monitor_logs`; make it
  derived/numeric.
- `affected_monitors` JSON can reference deleted monitors (no FK).
- Status/role strings have no single source of truth shared between DB and app code.

---

## 8. Recommended New Tables (NOT present today)

These were requested for verification and are **absent** from the project. Add only if/when
the corresponding features are built:

| Table | Purpose | Key columns (suggested) |
|-------|---------|-------------------------|
| `subscriptions` | First-class billing state (replaces the `users.subscription_plan` string) | `id, user_id FK, org_id FK, plan, status, current_period_start/end, provider, provider_subscription_id, created_at` |
| `payments` | Payment / invoice history | `id, user_id FK, subscription_id FK, amount_cents, currency, status, provider, provider_payment_id, paid_at, created_at` |
| `teams` | Only if a concept distinct from `organizations` is needed (today `organizations` + `team_members` already model teams) | — |
| `maintenance_window_monitors` | Proper M:N replacing the `affected_monitors` JSON array | `window_id FK, monitor_id FK, PK(window_id, monitor_id)` |
| `sessions` / `refresh_tokens` | Server-side session revocation (auth is currently stateless JWT) | `id, user_id FK, token_hash, expires_at, revoked_at` |

---

## 9. Prioritized Action List

**P0 — high value, low risk**
1. Drop redundant `ix_<table>_id` indexes on PKs.
2. Add FK indexes on `monitors(user_id)`, `team_members(org_id, user_id)`,
   `webhook_deliveries(endpoint_id)`, `alert_rules(user_id, monitor_id)`,
   `maintenance_windows(user_id)`.
3. Add `UNIQUE(org_id, user_id)` on `team_members`.

**P1 — correctness / integrity**
4. `monitors.uptime_percentage` → `numeric(5,2)`.
5. `CHECK` constraints / enums for status, role, type, plan, positive interval/timeout.
6. Convert JSON `text` columns → `jsonb`.

**P2 — scale / security**
7. Partition + retention policy for `monitor_logs`.
8. Encrypt `webhook_endpoints.secret` and `users.totp_secret` at rest.
9. Replace `subscription_plan` string with a real `subscriptions` table (+ `payments`).

> All schema changes should go through **Alembic migrations** (next revision `005`), matching
> the existing migration discipline (`001`–`004`).
