# Supabase CLI scaffold — HMS v3

This folder lets you run the v3 schema locally (Docker Postgres 17 + Supabase
Studio) and push it to a hosted Supabase project via the Supabase CLI.

> **Source of truth for SQL is [backend/db/v3-migrations/](../backend/db/v3-migrations/).**
> The files under `supabase/migrations/` mirror them by filename so the
> CLI applies them in order. Keep the two in sync — edit `backend/db/...`,
> then run `npm run db:sync` (see below) to copy into `supabase/migrations/`.

---

## Quick start — local Postgres

```bash
# one-time
npm install -g supabase
docker --version   # CLI needs Docker

# from repo root
supabase start          # boots Postgres 17 + Studio in Docker
supabase db reset       # applies every file in supabase/migrations/ in order
supabase status         # prints local URLs (Studio at http://127.0.0.1:54323)
```

The Java Spring backend connects to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

When you change SQL, re-run `supabase db reset` (wipes + reapplies — dev only).
For an incremental apply use `supabase migration up`.

---

## Pushing to a hosted Supabase project

```bash
# one-time — link this repo to your cloud project
supabase login                                # browser sign-in
supabase link --project-ref <YOUR-PROJECT-REF>

# every time you change SQL
supabase db push                              # applies new migrations to cloud
```

Project ref comes from your Supabase dashboard URL:
`https://supabase.com/dashboard/project/<YOUR-PROJECT-REF>`.

After the first `supabase db push`:

1. Open Supabase Studio → SQL Editor and run a smoke query, e.g.
   `select count(*) from hospital_profile;` should return 1.
2. Replace the bootstrap admin's `password_hash` immediately — see
   `backend/db/v3-migrations/900_seed_data.sql` for the placeholder.
3. In Supabase Studio → Settings → Database, grab the connection string
   and configure the Spring backend's `application.properties` accordingly.

---

## Syncing supabase/migrations/ with backend/db/v3-migrations/

The CLI only reads files under `supabase/migrations/`. To stay in sync with
the canonical source, run:

```powershell
# Windows PowerShell
Remove-Item supabase/migrations/* -Force -ErrorAction SilentlyContinue
Copy-Item backend/db/v3-migrations/*.sql supabase/migrations/
```

```bash
# bash / WSL
rm -rf supabase/migrations/*
cp backend/db/v3-migrations/*.sql supabase/migrations/
```

You can also add this as an npm script in `frontend/package.json` (or a
root-level package.json) for one-touch sync.

---

## What's disabled in `config.toml`

Auth, Realtime, Edge Functions, and Analytics are turned off — the Spring
backend handles authentication (the JWT in `user_sessions.refresh_hash` is
issued and verified by Spring, not by Supabase Auth).

If you ever want to use Supabase Storage for radiology DICOM or document
attachments, flip `[storage]` to `enabled = true` and wire the bucket
configuration here.

---

## Connecting from DBeaver (cloud)

Supabase Studio → **Project Settings → Database → Connection string** gives
you the direct connection details. In DBeaver:

```
Host:     db.<project-ref>.supabase.co
Port:     5432  (or 6543 for the pooler)
Database: postgres
User:     postgres
Password: <set in the Supabase dashboard>
SSL mode: require
```

---

## Reverting the schema (dev only)

```sql
drop schema public cascade;
create schema public;
grant usage on schema public to postgres;
```

Then `supabase db reset` to reapply v3 from scratch. **Never run this in
production** — it deletes every row in every table.
