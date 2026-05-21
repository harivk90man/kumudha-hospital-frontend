-- ============================================================
-- V45__create_radiology_procedures.sql
-- Radiology procedure catalogue. Each row defines one billable
-- imaging procedure with modality, body part, and scheduling
-- metadata.
-- service_id FK to services(id) is deferred to the pricing
-- module migration (Module 16).
-- ============================================================

CREATE TABLE radiology_procedures (

    id                              uuid        NOT NULL DEFAULT uuidv7(),

    -- Short machine code used on order forms and worklist displays
    procedure_code                  text        NOT NULL,

    procedure_name                  text        NOT NULL,

    -- Imaging modality (drives worklist routing to the correct room/machine)
    modality                        text        NOT NULL,

    -- Anatomical region being imaged; NULL when not applicable
    body_part                       text,

    -- Optional link to the performing department
    department_id                   uuid,

    -- Pricing link — FK to services(id) added in pricing module migration (Module 16)
    service_id                      uuid        NOT NULL,

    -- Expected duration to plan scheduling slots; NULL when variable
    typical_duration_mins           int,

    -- Patient preparation instructions
    requires_fasting                boolean     NOT NULL DEFAULT false,

    -- Indicates a radiologist must be physically present during the procedure
    requires_radiologist_presence   boolean     NOT NULL DEFAULT false,

    -- SAC (PCSAS) code for billing and regulatory reporting
    sac_code                        text,

    description                     text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_radiology_procedures
        PRIMARY KEY (id),

    CONSTRAINT chk_radiology_procedures_code_len
        CHECK (char_length(procedure_code) BETWEEN 2 AND 20),

    CONSTRAINT chk_radiology_procedures_modality
        CHECK (modality IN (
            'xray','ultrasound','ct','mri','mammography',
            'dexa','fluoroscopy','nuclear','other'
        )),

    CONSTRAINT chk_radiology_procedures_duration
        CHECK (typical_duration_mins IS NULL OR typical_duration_mins > 0),

    CONSTRAINT fk_radiology_procedures_dept
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

-- ── Indexes ───────────────────────────────────────────────────

-- Soft-delete-aware unique code — one active row per procedure code
CREATE UNIQUE INDEX uq_radiology_procedures_code
    ON radiology_procedures (procedure_code)
    WHERE deleted_at IS NULL;

-- Catalogue browse and worklist routing by modality
CREATE INDEX ix_radiology_procedures_modality
    ON radiology_procedures (modality)
    WHERE deleted_at IS NULL;

-- Filter procedures by performing department
CREATE INDEX ix_radiology_procedures_dept
    ON radiology_procedures (department_id)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_radiology_procedures_bu_touch
    BEFORE UPDATE ON radiology_procedures
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_radiology_procedures_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON radiology_procedures
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  radiology_procedures IS 'Radiology procedure catalogue. service_id FK to services(id) added in pricing module migration.';
COMMENT ON COLUMN radiology_procedures.procedure_code                IS 'Short unique code used on order forms and worklist displays (e.g. XR-CHEST-PA, CT-ABDOMEN). 2–20 characters.';
COMMENT ON COLUMN radiology_procedures.procedure_name                IS 'Human-readable procedure name shown on order forms, reports, and billing.';
COMMENT ON COLUMN radiology_procedures.modality                      IS 'xray | ultrasound | ct | mri | mammography | dexa | fluoroscopy | nuclear | other. Drives worklist routing to the correct room and machine.';
COMMENT ON COLUMN radiology_procedures.body_part                     IS 'Anatomical region being imaged (e.g. chest, abdomen, left knee). NULL when not applicable or procedure is multi-region.';
COMMENT ON COLUMN radiology_procedures.department_id                 IS 'Radiology sub-department that performs this procedure (e.g. CT suite, ultrasound room). NULL when not assigned.';
COMMENT ON COLUMN radiology_procedures.service_id                    IS 'FK → services(id) RESTRICT — constraint added in the pricing module migration (Module 16).';
COMMENT ON COLUMN radiology_procedures.typical_duration_mins         IS 'Expected procedure duration in minutes used for scheduling slot allocation. NULL when duration is variable or unknown.';
COMMENT ON COLUMN radiology_procedures.requires_fasting              IS 'TRUE when the patient must fast before the procedure (e.g. abdominal ultrasound).';
COMMENT ON COLUMN radiology_procedures.requires_radiologist_presence IS 'TRUE when a radiologist must be physically present during imaging (e.g. fluoroscopy, contrast injections).';
COMMENT ON COLUMN radiology_procedures.sac_code                      IS 'SAC (PCSAS) code for billing/regulatory reporting. Optional.';
COMMENT ON COLUMN radiology_procedures.description                   IS 'Free-text clinical description of the procedure, including patient preparation instructions and contraindications.';
COMMENT ON COLUMN radiology_procedures.version                       IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN radiology_procedures.deleted_at                    IS 'Soft-delete timestamp. NULL = live row.';
