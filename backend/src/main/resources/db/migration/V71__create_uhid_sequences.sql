-- ============================================================
-- V72__create_uhid_sequences.sql
-- One row per calendar year. The service increments last_seq
-- atomically via INSERT ... ON CONFLICT DO UPDATE RETURNING.
-- No explicit locking needed — Postgres handles it.
-- ============================================================

CREATE TABLE uhid_sequences (
    year     int    NOT NULL,
    last_seq bigint NOT NULL DEFAULT 0,
    CONSTRAINT pk_uhid_sequences PRIMARY KEY (year)
);

COMMENT ON TABLE  uhid_sequences            IS 'Per-year UHID counter. One row per year, incremented atomically on each patient registration.';
COMMENT ON COLUMN uhid_sequences.last_seq   IS 'Last issued sequence number for this year. 0 = no patients registered yet.';
