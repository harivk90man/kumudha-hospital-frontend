-- ============================================================
-- V25__create_stations.sql
-- Physical service-point registry. One active station per type.
-- Flyway-seeded at deployment — no application writes at boot.
-- ============================================================

CREATE TABLE stations (

    id              uuid        NOT NULL DEFAULT uuidv7(),
    display_name    text        NOT NULL,
    station_type    text        NOT NULL,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_stations
        PRIMARY KEY (id),

    CONSTRAINT chk_stations_type
        CHECK (station_type IN ('front_desk','vitals','doctor','lab_collection','lab_processing','radiology','pharmacy','billing'))
);

-- One active station per type — partial so a deleted station can be re-created
CREATE UNIQUE INDEX uq_stations_type
    ON stations (station_type) WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_stations_bu_touch
    BEFORE UPDATE ON stations
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_stations_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON stations
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  stations IS 'Physical service-point registry. One active station per type. Flyway-seeded at deployment.';
COMMENT ON COLUMN stations.station_type IS 'front_desk | vitals | doctor | lab_collection | lab_processing | radiology | pharmacy | billing';
COMMENT ON COLUMN stations.version      IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN stations.deleted_at   IS 'Soft-delete timestamp. NULL = live row.';

-- ── Seed data (Flyway system seed — created_by intentionally NULL) ──

INSERT INTO stations (id, display_name, station_type, created_at, updated_at)
VALUES
    (uuidv7(), 'Reception',           'front_desk',       now(), now()),
    (uuidv7(), 'Vitals',              'vitals',           now(), now()),
    (uuidv7(), 'Doctor Consultation', 'doctor',           now(), now()),
    (uuidv7(), 'Lab Collection',      'lab_collection',   now(), now()),
    (uuidv7(), 'Lab Processing',      'lab_processing',   now(), now()),
    (uuidv7(), 'Radiology',           'radiology',        now(), now()),
    (uuidv7(), 'Pharmacy',            'pharmacy',         now(), now()),
    (uuidv7(), 'Billing',             'billing',          now(), now());
