-- ============================================================
-- V61__create_services.sql
-- Hospital service catalogue. Central reference for every
-- billable item: lab tests, panels, radiology procedures,
-- medicines, procedures, room charges, and more.
-- Price changes automatically write to service_price_history
-- (V62) via fn_services_price_history().
-- Also wires the three deferred service_id FKs from
-- lab_tests (V38), lab_test_groups (V39), and
-- radiology_procedures (V45).
-- ============================================================

-- ── Trigger function: price-change audit ──────────────────────
-- Defined here because PL/pgSQL bodies are validated at first
-- invocation, not at definition time — safe to reference
-- service_price_history before it exists (created in V62).

CREATE OR REPLACE FUNCTION fn_services_price_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.default_price IS DISTINCT FROM OLD.default_price THEN
        -- Close the current open price history row (set effective_to = today)
        UPDATE service_price_history
           SET effective_to = current_date,
               updated_at   = now()
         WHERE service_id  = NEW.id
           AND effective_to IS NULL
           AND deleted_at   IS NULL;

        -- Insert new price history row for the new price
        INSERT INTO service_price_history (
            id, service_id, price, effective_from,
            changed_by, created_by, created_at, updated_at, version
        ) VALUES (
            uuidv7(), NEW.id, NEW.default_price, current_date,
            NEW.updated_by, COALESCE(NEW.updated_by, NEW.created_by),
            now(), now(), 0
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ── Table ──────────────────────────────────────────────────────

CREATE TABLE services (

    id              uuid        NOT NULL DEFAULT uuidv7(),

    -- Short unique billing code (e.g. LAB-CBC, RAD-XRAY-CHEST)
    service_code    text        NOT NULL,

    service_name    text        NOT NULL,

    -- Determines routing, reporting template, and GST applicability
    service_type    text        NOT NULL,

    -- Optional link to the performing department
    department_id   uuid,

    -- Current list price; changes trigger fn_services_price_history()
    default_price   numeric(14,2) NOT NULL,

    -- GST applicability flag
    is_taxable      boolean     NOT NULL DEFAULT false,

    -- GST rate applied when is_taxable = true
    default_gst_pct numeric(4,2) NOT NULL DEFAULT 0.00,

    -- SAC code required for taxable services under Indian GST law
    sac_code        text,

    description     text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_services
        PRIMARY KEY (id),

    CONSTRAINT chk_services_code_len
        CHECK (char_length(service_code) BETWEEN 2 AND 60),

    CONSTRAINT chk_services_type
        CHECK (service_type IN (
            'lab_test','lab_panel','radiology','medicine','procedure',
            'room_charge','nursing','consumable','ambulance','other'
        )),

    CONSTRAINT chk_services_price
        CHECK (default_price >= 0),

    CONSTRAINT chk_services_gst
        CHECK (default_gst_pct >= 0),

    CONSTRAINT fk_services_department
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

-- ── Indexes ───────────────────────────────────────────────────

-- Soft-delete-aware unique service code — allows code reuse after deletion
CREATE UNIQUE INDEX uq_services_code
    ON services (service_code)
    WHERE deleted_at IS NULL;

-- Catalogue browse by service type
CREATE INDEX ix_services_type
    ON services (service_type)
    WHERE deleted_at IS NULL;

-- Filter services by performing department
CREATE INDEX ix_services_department
    ON services (department_id)
    WHERE department_id IS NOT NULL AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_services_bu_touch
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 2: write price history when default_price changes
CREATE TRIGGER tr_services_au_price_history
    AFTER UPDATE OF default_price ON services
    FOR EACH ROW EXECUTE FUNCTION fn_services_price_history();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_services_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON services
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  services IS 'Hospital service catalogue. Referenced by lab_tests, lab_test_groups, radiology_procedures for billing. Price changes automatically write to service_price_history via trigger.';
COMMENT ON COLUMN services.service_code    IS 'Short unique billing code (e.g. LAB-CBC, RAD-XRAY-CHEST). 2–60 characters. Unique among non-deleted services.';
COMMENT ON COLUMN services.service_name    IS 'Human-readable service name shown on order forms, invoices, and reports.';
COMMENT ON COLUMN services.service_type    IS 'lab_test | lab_panel | radiology | medicine | procedure | room_charge | nursing | consumable | ambulance | other';
COMMENT ON COLUMN services.department_id   IS 'Optional: performing department (e.g. Pathology, Radiology). NULL when service is not department-specific.';
COMMENT ON COLUMN services.default_price   IS 'Current price. Changes trigger fn_services_price_history() to close the previous price window and open a new one.';
COMMENT ON COLUMN services.is_taxable      IS 'true = GST applies at default_gst_pct. Propagated to invoice line items at billing time.';
COMMENT ON COLUMN services.default_gst_pct IS 'GST percentage applied when is_taxable = true (e.g. 5.00, 12.00, 18.00). 0.00 for exempt services.';
COMMENT ON COLUMN services.sac_code        IS 'SAC (Service Accounting Code) for GST filing. Required for taxable services in Indian GST law.';
COMMENT ON COLUMN services.description     IS 'Optional clinical or administrative description of the service.';
COMMENT ON COLUMN services.version         IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN services.deleted_at      IS 'Soft-delete timestamp. NULL = live row.';

-- ── Deferred service_id FKs ───────────────────────────────────
-- lab_tests (V38), lab_test_groups (V39), and radiology_procedures (V45)
-- all declared service_id NOT NULL but deferred the FK until services existed.

-- Wire deferred service_id FKs now that services exists
ALTER TABLE lab_tests
    ADD CONSTRAINT fk_lab_tests_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;

ALTER TABLE lab_test_groups
    ADD CONSTRAINT fk_lab_test_groups_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;

ALTER TABLE radiology_procedures
    ADD CONSTRAINT fk_radiology_procedures_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
