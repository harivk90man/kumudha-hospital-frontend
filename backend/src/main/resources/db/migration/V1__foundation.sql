-- ============================================================
-- V1__foundation.sql
-- Extensions and shared trigger functions.
-- Every subsequent migration depends on this.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram indexes for patient name / mobile search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- uuid_generate_v4() compatibility
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- GIN + btree composite indexes

-- ------------------------------------------------------------
-- uuidv7()
-- Time-ordered UUID (version 7) — monotonically increasing,
-- B-tree friendly. Hibernate generates UUIDv7 client-side via
-- @UuidGenerator(Style.TIME); this function is the DB-side
-- fallback used by direct SQL inserts and seed data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    unix_ms   bigint;
    hi        bigint;
    lo        bigint;
    hex_str   text;
BEGIN
    unix_ms := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
    hi := (unix_ms << 16) | (floor(random() * 4096)::bigint & x'0FFF'::bigint);
    lo := (floor(random() * 2^62)::bigint) | (x'8000000000000000'::bigint);
    hex_str :=
        lpad(to_hex((hi >> 28) & x'FFFFFFFF'::bigint), 8, '0') || '-' ||
        lpad(to_hex((hi >> 12) & x'FFFF'::bigint),     4, '0') || '-' ||
        lpad(to_hex((x'7000'::bigint) | (hi & x'0FFF'::bigint)), 4, '0') || '-' ||
        lpad(to_hex((lo >> 48) & x'FFFF'::bigint),     4, '0') || '-' ||
        lpad(to_hex(lo & x'FFFFFFFFFFFF'::bigint),     12, '0');
    RETURN hex_str::uuid;
END;
$$;

-- ------------------------------------------------------------
-- fn_touch_updated()
-- BEFORE UPDATE — sets updated_at = now().
-- Does NOT touch version — Hibernate @Version owns that column.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- fn_append_only_guard()
-- BEFORE UPDATE OR DELETE on ledger / audit tables.
-- Raises an exception to prevent any mutation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_append_only_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'table % is append-only — UPDATE/DELETE is not permitted',
        TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;
