-- ============================================================
-- V75__create_appt_sequences.sql
-- Atomic appointment-number counter per calendar year.
-- Service layer issues the next APT number via:
--   INSERT INTO appt_sequences (year, last_seq) VALUES (?, 1)
--   ON CONFLICT (year) DO UPDATE SET last_seq = appt_sequences.last_seq + 1
--   RETURNING last_seq
-- Same pattern as uhid_sequences.
-- ============================================================

CREATE TABLE appt_sequences (
    year        int     NOT NULL,
    last_seq    bigint  NOT NULL DEFAULT 0,
    CONSTRAINT pk_appt_sequences PRIMARY KEY (year)
);

INSERT INTO appt_sequences (year, last_seq) VALUES (2026, 0) ON CONFLICT DO NOTHING;

COMMENT ON TABLE  appt_sequences IS 'Atomic appointment-number counter per year. Service layer increments atomically via INSERT ... ON CONFLICT DO UPDATE RETURNING last_seq.';
COMMENT ON COLUMN appt_sequences.year     IS 'Calendar year for which the sequence applies.';
COMMENT ON COLUMN appt_sequences.last_seq IS 'Last issued sequence number. Next appointment uses last_seq + 1.';
