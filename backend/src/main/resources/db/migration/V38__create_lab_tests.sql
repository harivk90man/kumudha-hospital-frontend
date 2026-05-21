-- ============================================================
-- V38__create_lab_tests.sql
-- Lab test catalogue. Each row defines one billable test with
-- gender-aware reference ranges, critical thresholds, and
-- result-type metadata.
-- service_id FK to services(id) is deferred to the pricing
-- module migration (Module 16).
-- ============================================================

CREATE TABLE lab_tests (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    -- Short machine code used on sample labels and result sheets
    test_code               text            NOT NULL,

    test_name               text            NOT NULL,

    -- Broad discipline bucket
    category                text            NOT NULL,

    -- Tube / specimen descriptor (e.g. 'EDTA whole blood', 'serum')
    sample_type             text            NOT NULL,

    -- Minimum volume required in millilitres
    sample_volume_ml        numeric(4,1),

    -- Optional link to the performing department
    department_id           uuid,

    -- Pricing link — FK to services(id) added in pricing module migration (Module 16)
    service_id              uuid            NOT NULL,

    -- SI or conventional unit for numeric results (e.g. 'mg/dL', 'g/L')
    unit                    text,

    -- Drives result-entry form and reporting template
    result_type             text            NOT NULL DEFAULT 'numeric',

    -- Gender-aware reference interval
    ref_min_male            numeric(12,4),
    ref_max_male            numeric(12,4),
    ref_min_female          numeric(12,4),
    ref_max_female          numeric(12,4),

    -- Plain-text description when numeric ranges cannot capture the reference
    reference_description   text,

    -- Critical threshold values — used by fn_lab_result_autoflag
    critical_low            numeric(12,4),
    critical_high           numeric(12,4),

    -- Walk-in / catalogue price; overridden at order time by the pricing module
    default_price           numeric(10,2),

    -- Expected turnaround from sample receipt to result release
    tat_hours               int,

    requires_fasting        boolean         NOT NULL DEFAULT false,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_lab_tests
        PRIMARY KEY (id),

    CONSTRAINT uq_lab_tests_code
        UNIQUE (test_code),

    CONSTRAINT chk_lab_tests_code_len
        CHECK (char_length(test_code) BETWEEN 2 AND 20),

    CONSTRAINT chk_lab_tests_category
        CHECK (category IN (
            'hematology','biochemistry','microbiology',
            'serology','pathology','endocrinology','immunology'
        )),

    CONSTRAINT chk_lab_tests_result_type
        CHECK (result_type IN (
            'numeric','positive_negative','reactive_nonreactive',
            'grade','free_text','image'
        )),

    CONSTRAINT chk_lab_tests_volume
        CHECK (sample_volume_ml IS NULL OR sample_volume_ml > 0),

    CONSTRAINT chk_lab_tests_price
        CHECK (default_price IS NULL OR default_price >= 0),

    CONSTRAINT chk_lab_tests_tat
        CHECK (tat_hours IS NULL OR tat_hours > 0),

    CONSTRAINT fk_lab_tests_department
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

-- ── Indexes ───────────────────────────────────────────────────

-- Catalogue browse by discipline
CREATE INDEX ix_lab_tests_category
    ON lab_tests (category)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_lab_tests_bu_touch
    BEFORE UPDATE ON lab_tests
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_lab_tests_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON lab_tests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  lab_tests IS 'Lab test catalogue. service_id FK to services(id) is added in the pricing module migration. reference ranges are gender-aware (ref_min/max_male/female).';
COMMENT ON COLUMN lab_tests.test_code               IS 'Short unique code printed on sample labels and result sheets (e.g. CBC, LFT-ALT). 2–20 characters.';
COMMENT ON COLUMN lab_tests.category                IS 'hematology | biochemistry | microbiology | serology | pathology | endocrinology | immunology.';
COMMENT ON COLUMN lab_tests.sample_type             IS 'Specimen descriptor (e.g. EDTA whole blood, serum, urine). Free text matched against sample collection SOPs.';
COMMENT ON COLUMN lab_tests.sample_volume_ml        IS 'Minimum specimen volume in millilitres. NULL when not applicable (e.g. swab tests).';
COMMENT ON COLUMN lab_tests.service_id              IS 'FK → services(id) RESTRICT — constraint added in the pricing module migration (Module 16).';
COMMENT ON COLUMN lab_tests.result_type             IS 'numeric | positive_negative | reactive_nonreactive | grade | free_text | image. Drives the result-entry form and report template.';
COMMENT ON COLUMN lab_tests.ref_min_male            IS 'Lower bound of normal range for male patients. NULL when not applicable.';
COMMENT ON COLUMN lab_tests.ref_max_male            IS 'Upper bound of normal range for male patients. NULL when not applicable.';
COMMENT ON COLUMN lab_tests.ref_min_female          IS 'Lower bound of normal range for female patients. NULL when not applicable.';
COMMENT ON COLUMN lab_tests.ref_max_female          IS 'Upper bound of normal range for female patients. NULL when not applicable.';
COMMENT ON COLUMN lab_tests.reference_description   IS 'Plain-text description of the reference range when numeric bounds cannot fully capture it (e.g. qualitative tests).';
COMMENT ON COLUMN lab_tests.critical_low            IS 'Critical threshold values. lab_result auto-flag trigger sets flag=critical_low/critical_high when value_numeric breaches these.';
COMMENT ON COLUMN lab_tests.critical_high           IS 'Critical threshold values. lab_result auto-flag trigger sets flag=critical_low/critical_high when value_numeric breaches these.';
COMMENT ON COLUMN lab_tests.default_price           IS 'Walk-in / catalogue price in the local currency unit. Overridden at order time by the pricing module. Must be >= 0.';
COMMENT ON COLUMN lab_tests.tat_hours               IS 'Expected turnaround time in hours from sample receipt to result release. NULL when no SLA is defined.';
COMMENT ON COLUMN lab_tests.requires_fasting        IS 'TRUE when the patient must fast before specimen collection (e.g. fasting glucose, lipid profile).';
COMMENT ON COLUMN lab_tests.version                 IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN lab_tests.deleted_at              IS 'Soft-delete timestamp. NULL = live row.';
