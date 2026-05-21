-- =====================================================================
-- 001_extensions.sql
-- Postgres extensions required by v3 schema.
-- Safe to run multiple times.
-- =====================================================================

set search_path = public;

-- Provides gen_random_uuid() — used as the uuidv7 fallback below on PG <17,
-- and required by pgjwt / pg_net if those are wired in later.
create extension if not exists pgcrypto;

-- Trigram fuzzy search — used by patient name / mobile lookups.
create extension if not exists pg_trgm;

-- Belt-and-braces UUID source.
create extension if not exists "uuid-ossp";

-- btree_gin lets GIN indexes coexist with btree composites
-- (used by some partial GIN indexes).
create extension if not exists btree_gin;
