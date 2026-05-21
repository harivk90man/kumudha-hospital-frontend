-- ============================================================
-- V76__create_op_sequences.sql
-- Atomic OP-number counter per calendar year.
-- Issued only when payment is taken (POST /api/appointments/{id}/pay).
-- Same pattern as uhid_sequences and appt_sequences.
-- ============================================================

CREATE TABLE op_sequences (
    year        int     NOT NULL,
    last_seq    bigint  NOT NULL DEFAULT 0,
    CONSTRAINT pk_op_sequences PRIMARY KEY (year)
);

INSERT INTO op_sequences (year, last_seq) VALUES (2026, 0) ON CONFLICT DO NOTHING;

COMMENT ON TABLE  op_sequences IS 'Atomic OP-number counter per year. Issued only on payment — enforces the payment-before-OP-number invariant.';
COMMENT ON COLUMN op_sequences.year     IS 'Calendar year for which the sequence applies.';
COMMENT ON COLUMN op_sequences.last_seq IS 'Last issued sequence number. Next OP visit uses last_seq + 1.';
