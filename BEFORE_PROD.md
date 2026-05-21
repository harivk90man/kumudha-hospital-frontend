# Before Going to Production

Checklist of dev-only settings that **must** be changed or removed before a production deployment.

---

## 1. Flyway — disable clean (CRITICAL)

**File:** `backend/src/main/resources/application.yml`

Remove or set to `true` (the safe default):

```yaml
# REMOVE THESE TWO LINES — they will wipe the production database on any checksum mismatch
spring:
  flyway:
    clean-on-validation-error: true  # ← DELETE
    clean-disabled: false             # ← DELETE (or set to true)
```

`clean-on-validation-error: true` drops ALL tables and reruns every migration whenever a
migration file is edited. In production this means one accidental file edit destroys all data.

---

## 2. JWT secret

**File:** `backend/src/main/resources/application.yml`

```yaml
hms:
  auth:
    jwt-secret: hms-default-secret-change-in-prod-min-32-chars!!  # ← REPLACE
```

Use a securely generated secret (min 32 chars, random). Inject via environment variable:

```yaml
hms:
  auth:
    jwt-secret: ${HMS_JWT_SECRET}
```

---

## 3. Database credentials

**File:** `backend/src/main/resources/application.yml`

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres  # ← point to prod DB
    username: postgres                              # ← use a dedicated DB user
    password: 123456                               # ← inject via env var
```

Recommended pattern:

```yaml
spring:
  datasource:
    url: ${DB_URL}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
```

---

## 4. Demo seed data

**File:** `backend/src/main/resources/db/migration/V71__seed_demo_users.sql`

V71 seeds 21 demo users with weak passwords (`123456` / `123123`). Delete or replace with
production user provisioning before go-live.

---

## 5. MCP DB server

**File:** `.mcp.json`

The `flash-db` MCP server exposes direct DB access to Claude Code. It should not be
reachable in production. Ensure the `db-mcp-server` process is not running on the
production host, and that port 5432 is not publicly accessible.

---

## 6. Frontend — backend URL

**File:** `frontend/.env` (create from `frontend/.env.example`)

```
VITE_API_BASE_URL=http://localhost:8080/api  # ← replace with prod URL
```

For a production build, set this in `frontend/.env.production` or as a build-time env var.

---

_Keep this file updated as new dev-only settings are added during development._
