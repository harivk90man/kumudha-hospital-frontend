-- ============================================================
-- V79__create_invoice_sequences.sql
-- Atomic invoice-number counter per calendar year.
-- Same pattern as op_sequences and appt_sequences.
-- Format: INV-{year}-{5-digit-seq} e.g. INV-2026-00042
-- ============================================================

CREATE TABLE invoice_sequences (
    year        int     NOT NULL,
    last_seq    bigint  NOT NULL DEFAULT 0,
    CONSTRAINT pk_invoice_sequences PRIMARY KEY (year)
);

INSERT INTO invoice_sequences (year, last_seq) VALUES (2026, 0) ON CONFLICT DO NOTHING;

COMMENT ON TABLE  invoice_sequences IS 'Atomic invoice-number counter per year. Same UPDATE…RETURNING pattern as op_sequences and appt_sequences.';
COMMENT ON COLUMN invoice_sequences.year     IS 'Calendar year for which the sequence applies.';
COMMENT ON COLUMN invoice_sequences.last_seq IS 'Last issued sequence number. Next invoice uses last_seq + 1.';
