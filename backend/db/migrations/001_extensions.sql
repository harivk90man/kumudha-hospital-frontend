-- =====================================================================
-- 001_extensions.sql
-- Required Postgres extensions and session settings.
-- Safe to run multiple times.
-- =====================================================================

set search_path = public;

-- gen_random_uuid() — used as DEFAULT on every PK.
create extension if not exists pgcrypto;

-- Trigram fuzzy search — used by patient name / mobile lookups.
create extension if not exists pg_trgm;

-- Belt-and-braces UUID source. pgcrypto's gen_random_uuid is sufficient
-- for our defaults; uuid-ossp is enabled because some Spring tooling
-- generates uuid_generate_v4() expressions.
create extension if not exists "uuid-ossp";

-- btree_gin lets GIN indexes coexist with btree composites
-- (useful for some of the partial GIN indexes below).
create extension if not exists btree_gin;
