-- ============================================================
-- V30__create_patient_queue.sql  (amended in dev — now creates
-- patient_states with the entered_at / left_at design)
--
-- Append log of every station a patient passes through after payment.
-- One row per station entry per visit.
-- left_at = NULL  → patient is currently at this station.
-- left_at IS NOT NULL → patient has moved on.
--
-- Partial unique index uq_patient_states_one_active on (op_visit_id)
-- WHERE left_at IS NULL ensures only one active row per visit at any
-- time. DB rejects a second INSERT immediately.
--
-- Tracking starts after payment — op_visit_id is always non-NULL.
-- ============================================================

CREATE TABLE patient_states (

    id              uuid        NOT NULL DEFAULT uuidv7(),
    patient_id      uuid        NOT NULL,

    -- Always present — tracking starts after payment creates op_visits
    op_visit_id     uuid        NOT NULL,

    station_id      uuid        NOT NULL,

    -- When the patient arrived at this station (start of duration window)
    entered_at      timestamptz NOT NULL DEFAULT now(),

    -- NULL = currently here; set when patient moves to next station
    left_at         timestamptz,

    -- Entity IDs for drill-down (consultation_id, invoice_id, lab_order_id, …)
    metadata        jsonb       NOT NULL DEFAULT '{}',

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_states
        PRIMARY KEY (id),

    CONSTRAINT fk_patient_states_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_states_visit
        FOREIGN KEY (op_visit_id) REFERENCES op_visits(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_states_station
        FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE RESTRICT
);

-- ── Indexes ───────────────────────────────────────────────────

-- DB-level guard: only one active stage per visit at any time.
-- INSERT of a second active row (left_at IS NULL) is rejected immediately.
CREATE UNIQUE INDEX uq_patient_states_one_active
    ON patient_states (op_visit_id)
    WHERE left_at IS NULL;

-- Full stage history for a visit in arrival order
CREATE INDEX ix_patient_states_visit
    ON patient_states (op_visit_id, entered_at ASC);

-- Live queue board: everyone currently at a station, oldest first
CREATE INDEX ix_patient_states_station_active
    ON patient_states (station_id, entered_at ASC)
    WHERE left_at IS NULL;

-- Where is this patient right now?
CREATE INDEX ix_patient_states_patient_active
    ON patient_states (patient_id)
    WHERE left_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

CREATE TRIGGER tr_patient_states_bu_touch
    BEFORE UPDATE ON patient_states
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

CREATE TRIGGER tr_patient_states_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON patient_states
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_states IS 'Append log of every station a patient passes through after payment. left_at = NULL means currently at that station. uq_patient_states_one_active enforces one active row per visit.';
COMMENT ON COLUMN patient_states.op_visit_id  IS 'OP visit this state belongs to. NOT NULL — tracking starts after payment creates op_visits.';
COMMENT ON COLUMN patient_states.station_id   IS 'Which station the patient is at. FK → stations(id) RESTRICT.';
COMMENT ON COLUMN patient_states.entered_at   IS 'When the patient arrived at this station. Start of the duration window.';
COMMENT ON COLUMN patient_states.left_at      IS 'When the patient left. NULL = currently here. Set by the transition UPDATE before the next INSERT.';
COMMENT ON COLUMN patient_states.metadata     IS 'Entity IDs for drill-down — e.g. {"consultation_id":"…"}, {"invoice_id":"…"}.';
COMMENT ON COLUMN patient_states.version      IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
