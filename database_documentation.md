# Uptime Monitoring Platform — Database Documentation

> **Source of truth:** This document describes the **actual** schema extracted from the
> live PostgreSQL database (`uptime_db`, PostgreSQL 16.6) via `pg_dump`, cross-checked
> against the SQLAlchemy models in `backend/models/` and the Alembic migrations
> (`backend/alembic/versions/001`–`004`). No tables or columns are invented.
>
> The canonical DDL is in [`schema.sql`](schema.sql).

---

## 1. Existing vs. Missing Tables

### ✅ Existing Tables (14 application tables + 1 Alembic bookkeeping table)

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | Account holders / authentication principals |
| 2 | `monitors` | The checks ("links") being monitored (HTTP, TCP, ping, SSL, DNS, keyword) |
| 3 | `monitor_logs` | Time-series result of every individual check (the history) |
| 4 | `incidents` | Outage records opened/resolved off the back of failing checks |
| 5 | `notifications` | Per-user alert channels (email, telegram, slack, discord, sms) |
| 6 | `status_pages` | Public status pages |
| 7 | `organizations` | Teams / workspaces |
| 8 | `team_members` | Membership join table linking users ↔ organizations |
| 9 | `api_keys` | Programmatic API access tokens (hashed) |
| 10 | `audit_logs` | Action trail for user operations |
| 11 | `maintenance_windows` | Planned downtime windows that suppress alerts |
| 12 | `alert_rules` | Configurable alert thresholds / escalation rules |
| 13 | `webhook_endpoints` | Outbound webhook subscriptions (HMAC-signed) |
| 14 | `webhook_deliveries` | Delivery log for each webhook attempt |
| — | `alembic_version` | Migration version bookkeeping (managed by Alembic) |

### ⚠️ Requested-but-Missing Tables

The prompt asked to verify these. The following **do not exist** in the project and were
**not** added (per the "do not invent" rule). They are listed in
[`database_improvements.md`](database_improvements.md) as recommendations:

| Requested table | Status | Closest existing implementation |
|-----------------|--------|---------------------------------|
| `teams` | ❌ Not present | `organizations` + `team_members` cover team functionality |
| `subscriptions` | ❌ Not present | A `subscription_plan` **string column** on `users` (and `plan` on `organizations`) — no billing table |
| `payments` | ❌ Not present | None — no billing/payment persistence exists |

---

## 2. Table-by-Table Reference

> Types below are the **real** PostgreSQL types from `pg_dump`. `integer` PKs are backed
> by an owned `*_id_seq` sequence (`GENERATED` via `DEFAULT nextval(...)`), i.e. auto-increment.

### `users`
Account + authentication principal. Root of almost every ownership relationship.

| Column | Type | Constraints / Default | Notes |
|--------|------|-----------------------|-------|
| `id` | integer | PK, sequence | Auto-increment |
| `name` | varchar(255) | NOT NULL | Display name |
| `email` | varchar(255) | NOT NULL, **UNIQUE** (`users_email_key`) | Login identifier |
| `password_hash` | varchar(255) | NOT NULL | bcrypt hash (see `core/security.py`) |
| `role` | varchar(50) | DEFAULT `'owner'` | owner/admin/member/viewer |
| `subscription_plan` | varchar(50) | DEFAULT `'free'` | free/pro/enterprise (string, not FK) |
| `is_verified` | **boolean** | DEFAULT `false` | Email verified — converted from string in migration 004 |
| `totp_secret` | varchar(64) | NULL | 2FA TOTP secret |
| `totp_enabled` | boolean | DEFAULT `false` | 2FA on/off |
| `avatar_url` | varchar(500) | NULL | |
| `last_login_at` | timestamptz | NULL | |
| `created_at` | timestamptz | DEFAULT `now()` | |

**Relationships:** 1‑to‑many → `monitors`, `notifications`, `status_pages`, `api_keys`,
`audit_logs`, `maintenance_windows`, `alert_rules`, `webhook_endpoints`, `organizations`
(as owner), `team_members`.

---

### `monitors`
A single check target ("link"). Holds configuration **and** latest state.

| Column | Type | Constraints / Default | Notes |
|--------|------|-----------------------|-------|
| `id` | integer | PK, sequence | |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE | Owner |
| `monitor_name` | varchar(255) | NOT NULL | |
| `target_url` | text | NOT NULL | URL / host:port / hostname |
| `monitor_type` | varchar(50) | DEFAULT `'http'` | http, keyword, tcp, ping, ssl, dns |
| `interval` | integer | DEFAULT `300` | Seconds between checks |
| `timeout` | integer | DEFAULT `10` | Seconds |
| `http_method` | varchar(10) | DEFAULT `'GET'` | |
| `expected_status_code` | integer | DEFAULT `200` | |
| `custom_headers` | text | NULL | JSON |
| `request_body` | text | NULL | |
| `current_status` | varchar(20) | DEFAULT `'pending'` | up/down/pending/paused |
| `is_paused` | boolean | DEFAULT `false` | |
| `uptime_percentage` | varchar(10) | DEFAULT `'100.00'` | Rolling 30‑day %, stored as string |
| `keyword` | varchar(255) | NULL | Keyword-check text |
| `dns_record_type` | varchar(10) | DEFAULT `'A'` | A/AAAA/CNAME/MX/TXT |
| `failure_count` | integer | DEFAULT `0` | Consecutive failures |
| `alert_threshold` | integer | DEFAULT `1` | Alert after N failures |
| `created_at` | timestamptz | DEFAULT `now()` | |
| `last_checked_at` | timestamptz | NULL | Drives the scheduler "due" logic |

**Relationships:** belongs to `users`; 1‑to‑many → `monitor_logs`, `incidents`
(both ON DELETE CASCADE).

---

### `monitor_logs`
Append-only time-series — **one row per check** (~1 row / interval / monitor).

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `monitor_id` | integer | NOT NULL, FK → `monitors(id)` ON DELETE CASCADE |
| `response_time` | double precision | NULL — milliseconds |
| `http_status` | integer | NULL |
| `is_up` | boolean | NOT NULL |
| `error_message` | varchar(500) | NULL |
| `checked_at` | timestamptz | DEFAULT `now()` |

**Index:** `ix_monitor_logs_monitor_checked (monitor_id, checked_at)` — **critical**: every
dashboard chart, uptime recalculation and log view filters on exactly these two columns.
Without it each query is a full table scan on the fastest-growing table.

---

### `incidents`
Outage lifecycle, opened when consecutive failures hit a monitor's `alert_threshold`.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `monitor_id` | integer | NOT NULL, FK → `monitors(id)` ON DELETE CASCADE |
| `outage_start_time` | timestamptz | DEFAULT `now()` |
| `recovery_time` | timestamptz | NULL |
| `error_message` | text | NULL |
| `incident_status` | varchar(20) | DEFAULT `'ongoing'` — ongoing/resolved |

**Indexes:** `ix_incidents_monitor_start (monitor_id, outage_start_time)` for recent-incident
listings; `ix_incidents_monitor_status (monitor_id, incident_status)` for the open-incident
lookup during the resolve path.

---

### `notifications`
Per-user alert delivery channels.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `notification_type` | varchar(50) | NOT NULL — email/telegram/slack/discord/sms |
| `destination` | varchar(500) | NOT NULL |
| `enabled` | boolean | DEFAULT `true` |
| `created_at` | timestamptz | DEFAULT `now()` |

---

### `status_pages`
Public status pages.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `slug` | varchar(100) | NOT NULL, **UNIQUE** (`status_pages_slug_key`) |
| `company_name` | varchar(255) | NOT NULL |
| `logo_url` | varchar(500) | NULL |
| `custom_domain` | varchar(255) | NULL |
| `is_public` | boolean | DEFAULT `true` |
| `description` | text | NULL |
| `created_at` | timestamptz | DEFAULT `now()` |

---

### `organizations`
Teams / workspaces.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `name` | varchar(255) | NOT NULL |
| `slug` | varchar(100) | NOT NULL, **UNIQUE** (`ix_organizations_slug`) |
| `owner_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `logo_url` | varchar(500) | NULL |
| `plan` | varchar(50) | DEFAULT `'free'` |
| `created_at` | timestamptz | DEFAULT `now()` |

---

### `team_members`
Join table: which users belong to which organization, and their role.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `org_id` | integer | NOT NULL, FK → `organizations(id)` ON DELETE CASCADE |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `role` | varchar(50) | DEFAULT `'developer'` — owner/admin/developer/viewer |
| `invited_by` | integer | NULL, FK → `users(id)` (no cascade) |
| `joined_at` | timestamptz | DEFAULT `now()` |

> ⚠️ No `UNIQUE(org_id, user_id)` constraint exists — see improvements.

---

### `api_keys`
Programmatic access tokens. Only a bcrypt **hash** + display prefix is stored.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `name` | varchar(255) | NOT NULL |
| `key_prefix` | varchar(12) | NOT NULL — first chars shown to user |
| `key_hash` | varchar(255) | NOT NULL — bcrypt hash of full key |
| `permissions` | text | NULL — JSON scope list |
| `last_used_at` | timestamptz | NULL |
| `expires_at` | timestamptz | NULL |
| `is_active` | boolean | DEFAULT `true` |
| `created_at` | timestamptz | DEFAULT `now()` |

**Index:** `ix_api_keys_key_prefix (key_prefix)` — keys are looked up by prefix at auth time.

---

### `audit_logs`
Action trail. `user_id` is nullable with `ON DELETE SET NULL` so history survives user deletion.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NULL, FK → `users(id)` **ON DELETE SET NULL** |
| `action` | varchar(100) | NOT NULL |
| `resource_type` | varchar(50) | NULL |
| `resource_id` | integer | NULL |
| `details` | text | NULL — JSON |
| `ip_address` | varchar(50) | NULL |
| `user_agent` | varchar(500) | NULL |
| `created_at` | timestamptz | DEFAULT `now()` |

**Indexes:** `ix_audit_logs_created_at`, `ix_audit_logs_user_created (user_id, created_at)`
for per-user, newest-first listing.

---

### `maintenance_windows`
Planned downtime that suppresses alerts.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `name` | varchar(255) | NOT NULL |
| `description` | text | NULL |
| `starts_at` | timestamptz | NOT NULL |
| `ends_at` | timestamptz | NOT NULL |
| `is_recurring` | boolean | DEFAULT `false` |
| `recurrence_cron` | varchar(100) | NULL — cron expression |
| `affected_monitors` | text | NULL — JSON array of monitor IDs |
| `created_at` | timestamptz | DEFAULT `now()` |

> ⚠️ `affected_monitors` is a JSON array in a `text` column, not a real FK relationship.

---

### `alert_rules`
Configurable alerting thresholds / escalation.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `monitor_id` | integer | NULL, FK → `monitors(id)` ON DELETE CASCADE (NULL = global rule) |
| `name` | varchar(255) | NOT NULL |
| `consecutive_failures` | integer | DEFAULT `1` |
| `recovery_confirmations` | integer | DEFAULT `1` |
| `silence_minutes` | integer | DEFAULT `0` |
| `escalation_after_minutes` | integer | NULL |
| `is_active` | boolean | DEFAULT `true` |
| `created_at` | timestamptz | DEFAULT `now()` |

---

### `webhook_endpoints`
Outbound webhook subscriptions.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `user_id` | integer | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `name` | varchar(255) | NOT NULL |
| `url` | varchar(1000) | NOT NULL |
| `secret` | varchar(255) | NULL — HMAC-SHA256 signing secret |
| `events` | text | NULL — JSON event filter list |
| `is_active` | boolean | DEFAULT `true` |
| `last_triggered_at` | timestamptz | NULL |
| `created_at` | timestamptz | DEFAULT `now()` |

---

### `webhook_deliveries`
Delivery attempt log for each webhook.

| Column | Type | Constraints / Default |
|--------|------|-----------------------|
| `id` | integer | PK, sequence |
| `endpoint_id` | integer | NOT NULL, FK → `webhook_endpoints(id)` ON DELETE CASCADE |
| `event` | varchar(50) | NOT NULL |
| `payload` | text | NULL — JSON sent |
| `response_status` | integer | NULL |
| `response_body` | text | NULL |
| `success` | boolean | DEFAULT `false` |
| `delivered_at` | timestamptz | DEFAULT `now()` |

---

## 3. Entity-Relationship Diagram (text)

```
users (root principal)
  │
  ├──< monitors ──────< monitor_logs        (time-series check history)
  │        │
  │        └──────────< incidents           (outage lifecycle)
  │        ▲
  │        └──── alert_rules.monitor_id (nullable; NULL = global)
  │
  ├──< notifications                        (alert channels)
  ├──< status_pages                         (slug UNIQUE)
  ├──< api_keys                             (key_prefix indexed)
  ├──< audit_logs            (user_id ON DELETE SET NULL — history preserved)
  ├──< maintenance_windows   (affected_monitors = JSON array, not FK)
  ├──< alert_rules
  ├──< webhook_endpoints ────< webhook_deliveries
  │
  ├──< organizations (owner_id)
  │        │
  │        └──< team_members >── users        (M:N: users ⇄ organizations)
  │
  └──< team_members (user_id, invited_by)
```

### Relationship summary

| Parent | Child | Cardinality | ON DELETE |
|--------|-------|-------------|-----------|
| users | monitors | 1:N | CASCADE |
| monitors | monitor_logs | 1:N | CASCADE |
| monitors | incidents | 1:N | CASCADE |
| monitors | alert_rules | 1:N (nullable) | CASCADE |
| users | notifications / status_pages / api_keys / maintenance_windows / alert_rules / webhook_endpoints | 1:N | CASCADE |
| users | audit_logs | 1:N | SET NULL |
| users | organizations (owner) | 1:N | CASCADE |
| organizations | team_members | 1:N | CASCADE |
| users | team_members | 1:N | CASCADE |
| users | team_members (invited_by) | 1:N | *no action* |
| webhook_endpoints | webhook_deliveries | 1:N | CASCADE |

---

## 4. Architecture Notes

- **Single-tenant ownership model:** nearly everything hangs off `users.id`. Organizations
  exist but most resources (monitors, etc.) are owned by an individual `user_id`, not by an
  `org_id` — team-level resource sharing is not yet wired into the data model.
- **Hot path = `monitor_logs`:** the in-process monitoring engine
  (`backend/core/monitoring.py`) appends one row per check and the dashboard reads ranges by
  `(monitor_id, checked_at)`. This is the table that defines the system's scaling profile.
- **Cascade hygiene:** deleting a user cleanly removes all owned resources; deleting a
  monitor removes its logs/incidents. Audit logs are deliberately preserved (SET NULL).
- **JSON-in-text columns:** `custom_headers`, `permissions`, `events`, `affected_monitors`,
  `details`, `payload` store JSON as `text` rather than native `jsonb`.

See [`database_improvements.md`](database_improvements.md) for the quality audit and scores.
