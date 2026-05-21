-- ============================================================
-- V37__create_doctor_recommendations.sql
-- Doctor-ordered follow-on actions from a consultation.
-- One row per recommendation (lab test, radiology, follow-up
-- appointment, specialist referral, physio, surgery, IP admission).
-- At most one of (follow_up_appointment_id, lab_order_id,
-- radiology_order_id) may be non-NULL per row — enforced by
-- chk_doctor_recommendations_one_fk.
-- FKs for lab_order_id and radiology_order_id are deferred until
-- Modules 12 and 13 respectively.
-- ============================================================

CREATE TABLE doctor_recommendations (

    id                          uuid        NOT NULL DEFAULT uuidv7(),

    consultation_id             uuid        NOT NULL,
    patient_id                  uuid        NOT NULL,

    recommendation_type         text        NOT NULL,

    -- ── Polymorphic parent references — at most one non-NULL ──
    -- follow_up_appointment_id: set when recommendation_type = 'follow_up'
    follow_up_appointment_id    uuid,
    -- lab_order_id: set when recommendation_type = 'lab' — FK added in lab module migration (Module 12)
    lab_order_id                uuid,
    -- radiology_order_id: set when recommendation_type = 'radiology' — FK added in radiology module migration (Module 13)
    radiology_order_id          uuid,

    -- Free-text notes for specialist_referral, physio, surgery, or admission
    referral_notes              text,
    notes                       text,

    priority                    text        NOT NULL DEFAULT 'routine',
    status                      text        NOT NULL DEFAULT 'open',

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by                  uuid        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    version                     int         NOT NULL DEFAULT 0,
    deleted_at                  timestamptz,
    deleted_by                  uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_doctor_recommendations
        PRIMARY KEY (id),

    CONSTRAINT fk_doctor_recommendations_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE RESTRICT,

    CONSTRAINT fk_doctor_recommendations_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,

    CONSTRAINT fk_doctor_recommendations_followup
        FOREIGN KEY (follow_up_appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,

    CONSTRAINT chk_doctor_recommendations_type
        CHECK (recommendation_type IN (
            'follow_up','lab','radiology','specialist_referral',
            'physio','surgery','admission'
        )),

    CONSTRAINT chk_doctor_recommendations_priority
        CHECK (priority IN ('routine','urgent','stat')),

    CONSTRAINT chk_doctor_recommendations_status
        CHECK (status IN ('open','scheduled','completed','cancelled','declined')),

    -- At most one parent FK column may be populated per row
    CONSTRAINT chk_doctor_recommendations_one_fk
        CHECK (num_nonnulls(follow_up_appointment_id, lab_order_id, radiology_order_id) <= 1)
);

-- ── Indexes ───────────────────────────────────────────────────

-- All recommendations for a consultation (consultation detail view)
CREATE INDEX ix_doctor_recommendations_consultation
    ON doctor_recommendations (consultation_id);

-- Open recommendations worklist — ordered by priority then arrival
CREATE INDEX ix_doctor_recommendations_worklist
    ON doctor_recommendations (status, priority, created_at)
    WHERE status = 'open' AND deleted_at IS NULL;

-- Patient recommendation history filtered by status
CREATE INDEX ix_doctor_recommendations_patient
    ON doctor_recommendations (patient_id, status)
    WHERE deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_doctor_recommendations_bu_touch
    BEFORE UPDATE ON doctor_recommendations
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_doctor_recommendations_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON doctor_recommendations
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  doctor_recommendations IS 'Doctor-ordered follow-on actions: lab test, radiology, follow-up appointment, specialist referral, physio, surgery, or IP admission. At most one parent FK is non-NULL.';
COMMENT ON COLUMN doctor_recommendations.consultation_id             IS 'Source consultation that generated this recommendation.';
COMMENT ON COLUMN doctor_recommendations.recommendation_type         IS 'follow_up | lab | radiology | specialist_referral | physio | surgery | admission.';
COMMENT ON COLUMN doctor_recommendations.follow_up_appointment_id    IS 'Non-NULL when recommendation_type = follow_up. FK → appointments(id) ON DELETE RESTRICT.';
COMMENT ON COLUMN doctor_recommendations.lab_order_id                IS 'FK → lab_orders(id) RESTRICT — constraint added in the lab module migration (V__create_lab_orders).';
COMMENT ON COLUMN doctor_recommendations.radiology_order_id          IS 'FK → radiology_orders(id) RESTRICT — constraint added in the radiology module migration.';
COMMENT ON COLUMN doctor_recommendations.referral_notes              IS 'Clinical notes for specialist_referral, physio, surgery, or admission recommendations. Free text.';
COMMENT ON COLUMN doctor_recommendations.notes                       IS 'General notes for any recommendation type. Free text.';
COMMENT ON COLUMN doctor_recommendations.priority                    IS 'routine | urgent | stat. Drives worklist ordering and SLA targets.';
COMMENT ON COLUMN doctor_recommendations.status                      IS 'open | scheduled | completed | cancelled | declined. Terminal states: completed, cancelled, declined.';
COMMENT ON COLUMN doctor_recommendations.version                     IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN doctor_recommendations.deleted_at                  IS 'Soft-delete timestamp. NULL = live row.';
