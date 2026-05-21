-- ============================================================
-- V51__create_drug_catalogue.sql
-- Medicine master catalogue. Single source of truth for drug
-- identity, scheduling, form, pricing parameters and stock
-- thresholds.
-- drug_schedule H/H1/X = controlled drugs.
-- is_narcotic = true triggers NDPS register entry on dispense.
-- GST rate stored as an exact bucket (0|5|12|18|28) so the
-- pharmacy and purchase modules never need to look it up.
-- Also wires the deferred FK from prescription_items.medicine_id
-- (declared in V36 without a FK constraint).
-- Soft-delete via deleted_at (full 7 audit).
-- ============================================================

CREATE TABLE drug_catalogue (

    id                      uuid            NOT NULL DEFAULT uuidv7(),

    -- Short, human-readable drug code (e.g. DRG-001)
    drug_code               text            NOT NULL,

    generic_name            text            NOT NULL,

    -- Trade/brand name; NULL for purely generic entries
    brand_name              text,

    manufacturer            text,

    -- Pharmacological class (e.g. 'antibiotic', 'analgesic')
    drug_class              text,

    -- Therapeutic category (e.g. 'cardiovascular', 'neurology')
    category                text,

    -- Regulatory schedule under Indian Drugs & Cosmetics Act
    drug_schedule           text,

    -- TRUE triggers NDPS register entry on every dispense
    is_narcotic             boolean         NOT NULL DEFAULT false,

    -- Physical dosage form
    form                    text            NOT NULL,

    -- Strength per unit (e.g. '500 mg', '5 mg/ml')
    strength                text,

    -- Dispensing unit label (e.g. 'tablet', 'ml', 'vial')
    unit                    text            NOT NULL,

    -- Number of units per saleable pack
    pack_size               int             NOT NULL DEFAULT 1,

    -- HSN code for GST classification
    hsn_code                text,

    -- GST rate bucket; applies to purchase and pharmacy sale calculations
    gst_pct                 numeric(4,2)    NOT NULL DEFAULT 12.00,

    -- When true, a valid prescription is required to dispense
    requires_prescription   boolean         NOT NULL DEFAULT true,

    -- Alert threshold for low-stock notification (in dispensing units)
    low_stock_threshold     int             NOT NULL DEFAULT 0,

    -- Maximum stocking level (in dispensing units); 0 = uncapped
    max_stock_threshold     int             NOT NULL DEFAULT 0,

    -- Required storage condition
    storage_temp            text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by              uuid            NOT NULL,
    created_at              timestamptz     NOT NULL DEFAULT now(),
    updated_by              uuid,
    updated_at              timestamptz     NOT NULL DEFAULT now(),
    version                 int             NOT NULL DEFAULT 0,
    deleted_at              timestamptz,
    deleted_by              uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_drug_catalogue
        PRIMARY KEY (id),

    CONSTRAINT chk_drug_catalogue_code_len
        CHECK (char_length(drug_code) BETWEEN 2 AND 20),

    CONSTRAINT chk_drug_catalogue_schedule
        CHECK (drug_schedule IS NULL OR drug_schedule IN ('H','H1','X','G','OTC')),

    CONSTRAINT chk_drug_catalogue_form
        CHECK (form IN ('tablet','capsule','syrup','injection','cream','ointment','drops','inhaler','patch','suppository','powder','other')),

    CONSTRAINT chk_drug_catalogue_gst
        CHECK (gst_pct IN (0, 5, 12, 18, 28)),

    CONSTRAINT chk_drug_catalogue_pack_size
        CHECK (pack_size > 0),

    CONSTRAINT chk_drug_catalogue_reorder
        CHECK (low_stock_threshold >= 0 AND max_stock_threshold >= 0),

    CONSTRAINT chk_drug_catalogue_storage_temp
        CHECK (storage_temp IS NULL OR storage_temp IN ('room','refrigerated','frozen','controlled'))
);

-- ── Indexes ───────────────────────────────────────────────────

-- Partial unique: drug_code must be unique among live (non-deleted) rows
CREATE UNIQUE INDEX uq_drug_catalogue_code
    ON drug_catalogue (drug_code)
    WHERE deleted_at IS NULL;

-- Primary dispensing search: generic name + strength + form
CREATE INDEX ix_drug_catalogue_generic
    ON drug_catalogue (lower(generic_name), strength, form)
    WHERE deleted_at IS NULL;

-- Pharmacological class browse / reporting
CREATE INDEX ix_drug_catalogue_drug_class
    ON drug_catalogue (drug_class)
    WHERE drug_class IS NOT NULL AND deleted_at IS NULL;

-- Fast lookup of narcotic drugs for NDPS controls
CREATE INDEX ix_drug_catalogue_narcotic
    ON drug_catalogue (is_narcotic)
    WHERE is_narcotic = true AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_drug_catalogue_bu_touch
    BEFORE UPDATE ON drug_catalogue
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_drug_catalogue_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON drug_catalogue
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  drug_catalogue IS 'Medicine master catalogue. drug_schedule H/H1/X = controlled drugs. is_narcotic = true triggers NDPS register entry on dispense.';
COMMENT ON COLUMN drug_catalogue.drug_code            IS 'Short human-readable drug code (e.g. DRG-001). 2–20 characters. Unique among live rows.';
COMMENT ON COLUMN drug_catalogue.generic_name         IS 'INN or approved generic name. Primary key for clinical matching and substitution.';
COMMENT ON COLUMN drug_catalogue.brand_name           IS 'Trade/brand name. NULL for catalogue entries that represent only the generic molecule.';
COMMENT ON COLUMN drug_catalogue.manufacturer         IS 'Name of the manufacturing company.';
COMMENT ON COLUMN drug_catalogue.drug_class           IS 'Pharmacological class (e.g. antibiotic, analgesic, antihypertensive).';
COMMENT ON COLUMN drug_catalogue.category             IS 'Therapeutic category (e.g. cardiovascular, neurology, dermatology).';
COMMENT ON COLUMN drug_catalogue.drug_schedule        IS 'Regulatory schedule under the Indian Drugs & Cosmetics Act: H | H1 | X | G | OTC. NULL = unscheduled.';
COMMENT ON COLUMN drug_catalogue.is_narcotic          IS 'TRUE when the drug falls under the NDPS Act. Every dispense must create a narcotic_register entry.';
COMMENT ON COLUMN drug_catalogue.form                 IS 'Physical dosage form: tablet | capsule | syrup | injection | cream | ointment | drops | inhaler | patch | suppository | powder | other.';
COMMENT ON COLUMN drug_catalogue.strength             IS 'Strength per dosage unit (e.g. 500 mg, 5 mg/ml, 10 IU). NULL when strength is variable or not applicable.';
COMMENT ON COLUMN drug_catalogue.unit                 IS 'Dispensing unit label (e.g. tablet, ml, vial, sachet).';
COMMENT ON COLUMN drug_catalogue.pack_size            IS 'Number of dispensing units per saleable pack. Must be > 0.';
COMMENT ON COLUMN drug_catalogue.hsn_code             IS 'HSN code for GST classification and invoice generation.';
COMMENT ON COLUMN drug_catalogue.gst_pct              IS 'GST rate bucket: 0 | 5 | 12 | 18 | 28. Applies to drug_stock purchase and pharmacy sale calculations.';
COMMENT ON COLUMN drug_catalogue.requires_prescription IS 'TRUE when a valid prescription is required before dispensing. FALSE for OTC drugs.';
COMMENT ON COLUMN drug_catalogue.low_stock_threshold  IS 'Quantity (in dispensing units) below which a low-stock alert is triggered. 0 = no alert.';
COMMENT ON COLUMN drug_catalogue.max_stock_threshold  IS 'Maximum stocking level in dispensing units. 0 = uncapped.';
COMMENT ON COLUMN drug_catalogue.storage_temp         IS 'Required storage condition: room | refrigerated | frozen | controlled. NULL = no special requirement.';
COMMENT ON COLUMN drug_catalogue.version              IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN drug_catalogue.deleted_at           IS 'Soft-delete timestamp. NULL = live row.';

-- ── Deferred FK from prescription_items ───────────────────────
-- medicine_id column was declared in V36 without a FK constraint
-- because drug_catalogue did not exist yet.
-- Now that drug_catalogue is in place, the FK can be wired.

ALTER TABLE prescription_items
    ADD CONSTRAINT fk_prescription_items_medicine
    FOREIGN KEY (medicine_id) REFERENCES drug_catalogue(id) ON DELETE RESTRICT;
