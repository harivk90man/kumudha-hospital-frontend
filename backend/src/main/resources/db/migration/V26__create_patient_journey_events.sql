-- ============================================================
-- V26__create_patient_journey_events.sql
-- Append-only ledger of every station transition per visit.
-- Partitioned monthly by created_at. No UPDATE or DELETE ever.
-- op_visit_id FK is deferred — added in V29 once op_visits exists.
-- ============================================================

CREATE TABLE patient_journey_events (

    id                                  uuid        NOT NULL,
    patient_id                          uuid        NOT NULL,

    -- op_visit_id FK added in V29 when op_visits is created
    op_visit_id                         uuid,

    from_station_id                     uuid,
    to_station_id                       uuid        NOT NULL,
    triggered_by_user_id                uuid,

    -- Computed by BEFORE INSERT trigger fn_compute_journey_duration()
    duration_in_prev_station_seconds    int,

    reason                              text,
    metadata                            jsonb       NOT NULL DEFAULT '{}',

    -- ── Uniform audit + soft-delete block (cosmetic — append-only guard prevents UPDATE/DELETE) ──
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_patient_journey_events
        PRIMARY KEY (id, created_at),

    CONSTRAINT chk_patient_journey_events_duration
        CHECK (duration_in_prev_station_seconds IS NULL OR duration_in_prev_station_seconds >= 0),

    CONSTRAINT fk_patient_journey_events_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_journey_events_from_station
        FOREIGN KEY (from_station_id) REFERENCES stations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_journey_events_to_station
        FOREIGN KEY (to_station_id) REFERENCES stations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_patient_journey_events_triggered_by
        FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL

) PARTITION BY RANGE (created_at);

-- Initial monthly partitions
CREATE TABLE patient_journey_events_2026_05 PARTITION OF patient_journey_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE patient_journey_events_2026_06 PARTITION OF patient_journey_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- ── Indexes ───────────────────────────────────────────────────

-- All patient transitions for a patient (chronological drill-down)
CREATE INDEX ix_patient_journey_events_patient
    ON patient_journey_events (patient_id, created_at DESC);

-- All transitions for a specific visit (op_visit timeline)
CREATE INDEX ix_patient_journey_events_visit
    ON patient_journey_events (op_visit_id, created_at DESC)
    WHERE op_visit_id IS NOT NULL;

-- Which patients arrived at a given station (station workload view)
CREATE INDEX ix_patient_journey_events_to_station
    ON patient_journey_events (to_station_id, created_at DESC);

-- ── Functions & Triggers ──────────────────────────────────────

-- Computes duration_in_prev_station_seconds from the previous journey event
CREATE OR REPLACE FUNCTION fn_compute_journey_duration() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_arrived_at timestamptz;
BEGIN
    IF NEW.from_station_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT created_at INTO v_arrived_at
    FROM patient_journey_events
    WHERE patient_id = NEW.patient_id
      AND (op_visit_id = NEW.op_visit_id
           OR (op_visit_id IS NULL AND NEW.op_visit_id IS NULL))
      AND to_station_id = NEW.from_station_id
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_arrived_at IS NOT NULL THEN
        NEW.duration_in_prev_station_seconds :=
            GREATEST(0, EXTRACT(EPOCH FROM (now() - v_arrived_at))::int);
    END IF;
    RETURN NEW;
END;
$$;

-- Layer 0: compute wait duration before insert
CREATE TRIGGER tr_patient_journey_events_bi_duration
    BEFORE INSERT ON patient_journey_events
    FOR EACH ROW EXECUTE FUNCTION fn_compute_journey_duration();

-- Append-only guard — no UPDATE or DELETE permitted
CREATE TRIGGER tr_patient_journey_events_bud_guard
    BEFORE UPDATE OR DELETE ON patient_journey_events
    FOR EACH ROW EXECUTE FUNCTION fn_append_only_guard();

-- Layer 3: full-row audit trail (INSERT only — guard blocks UPDATE/DELETE at trigger level)
CREATE TRIGGER tr_patient_journey_events_au_audit
    AFTER INSERT ON patient_journey_events
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  patient_journey_events IS 'Append-only ledger of every station transition per visit. Partitioned monthly by created_at. No UPDATE or DELETE ever — guard trigger raises exception.';
COMMENT ON COLUMN patient_journey_events.duration_in_prev_station_seconds IS 'Seconds spent at from_station — computed by BEFORE INSERT trigger. NULL on first event of visit.';
COMMENT ON COLUMN patient_journey_events.op_visit_id                      IS 'OP visit context. NULL only for future IP-only transitions. FK added in V29.';
COMMENT ON COLUMN patient_journey_events.metadata                         IS 'Entity IDs for drill-down: consultation_id, lab_order_id, radiology_order_id, pharmacy_sale_id, invoice_id, appointment_id.';
COMMENT ON COLUMN patient_journey_events.version                          IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
