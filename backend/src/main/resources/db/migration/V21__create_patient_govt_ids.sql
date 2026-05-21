-- ============================================================
-- V21__create_patient_govt_ids.sql
-- Government-issued identity documents per patient.
-- One row per document type per patient. CASCADE child of patients.
-- Schema ref: docs/03-schema/v3/modules/07-patient.html#patient_govt_ids
-- ============================================================

CREATE TABLE patient_govt_ids (

    id              uuid        NOT NULL DEFAULT uuidv7(),
    patient_id      uuid        NOT NULL,
    id_type         text        NOT NULL,
    id_number       text        NOT NULL,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_govt_ids
        PRIMARY KEY (id),

    CONSTRAINT fk_patient_govt_ids_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,

    CONSTRAINT chk_patient_govt_ids_type
        CHECK (id_type IN ('aadhaar','pan','voter_id','passport','driving_licence','ration_card','other')),

    CONSTRAINT chk_patient_govt_ids_number_len
        CHECK (char_length(id_number) BETWEEN 1 AND 50)
);

-- ── Indexes ───────────────────────────────────────────────────

-- A patient cannot have two active rows of the same id_type
CREATE UNIQUE INDEX uq_patient_govt_ids_type
    ON patient_govt_ids (patient_id, id_type)
    WHERE deleted_at IS NULL;

-- Load all ID documents for a patient chart
CREATE INDEX ix_patient_govt_ids_patient
    ON patient_govt_ids (patient_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_patient_govt_ids_bu_touch
    BEFORE UPDATE ON patient_govt_ids
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_patient_govt_ids_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_govt_ids
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_govt_ids IS 'Government-issued identity documents per patient. One active row per document type. CASCADE child of patients — hard-deleting a patient removes their ID rows.';
COMMENT ON COLUMN patient_govt_ids.patient_id  IS 'Parent patient. CASCADE: patient hard-delete removes all their ID rows.';
COMMENT ON COLUMN patient_govt_ids.id_type     IS 'aadhaar | pan | voter_id | passport | driving_licence | ration_card | other';
COMMENT ON COLUMN patient_govt_ids.id_number   IS 'Document number as printed. For Aadhaar, store masked form only (last 4 digits visible, e.g. XXXX-XXXX-7890).';
COMMENT ON COLUMN patient_govt_ids.version     IS 'Optimistic-lock counter — owned by Hibernate @Version.';
COMMENT ON COLUMN patient_govt_ids.deleted_at  IS 'Soft-delete timestamp. NULL = live row.';
