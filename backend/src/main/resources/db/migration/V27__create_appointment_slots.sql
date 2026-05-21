-- ============================================================
-- V27__create_appointment_slots.sql
-- Doctor appointment slot grid. One row per bookable time slot.
-- Slots are generated ahead of time by the scheduling service
-- and transitioned through: available → booked / blocked / cancelled.
-- ============================================================

CREATE TABLE appointment_slots (

    id              uuid        NOT NULL DEFAULT uuidv7(),
    doctor_id       uuid        NOT NULL,
    slot_start      timestamptz NOT NULL,
    duration_mins   int         NOT NULL DEFAULT 15,
    status          text        NOT NULL DEFAULT 'available',

    -- Populated when status = 'booked' — the patient user who booked
    booked_by       uuid,

    -- Populated when status = 'blocked' — reason for the block
    blocked_reason  text,

    -- ── Uniform audit + soft-delete block ────────────────────
    created_by      uuid        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         int         NOT NULL DEFAULT 0,
    deleted_at      timestamptz,
    deleted_by      uuid,

    -- ── Constraints ──────────────────────────────────────────
    CONSTRAINT pk_appointment_slots
        PRIMARY KEY (id),

    CONSTRAINT chk_appointment_slots_status
        CHECK (status IN ('available','booked','blocked','cancelled')),

    CONSTRAINT chk_appointment_slots_duration
        CHECK (duration_mins > 0),

    -- blocked_reason is only meaningful when the slot is blocked
    CONSTRAINT chk_appointment_slots_blocked
        CHECK (status = 'blocked' OR blocked_reason IS NULL),

    CONSTRAINT fk_appointment_slots_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT fk_appointment_slots_booked_by
        FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── Indexes ───────────────────────────────────────────────────

-- Hard uniqueness — a doctor cannot have two slots starting at the same time (even after cancellation)
CREATE UNIQUE INDEX uq_appointment_slots_doctor_start
    ON appointment_slots (doctor_id, slot_start);

-- Reception: fetch a doctor's upcoming available slots
CREATE INDEX ix_appointment_slots_doctor
    ON appointment_slots (doctor_id, slot_start, status)
    WHERE deleted_at IS NULL;

-- Patient-facing slot picker: all available slots across all doctors
CREATE INDEX ix_appointment_slots_available
    ON appointment_slots (slot_start)
    WHERE status = 'available' AND deleted_at IS NULL;

-- ── Triggers ──────────────────────────────────────────────────

-- Layer 1: bump updated_at on every UPDATE
CREATE TRIGGER tr_appointment_slots_bu_touch
    BEFORE UPDATE ON appointment_slots
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

-- Layer 3: full-row audit trail
CREATE TRIGGER tr_appointment_slots_au_audit
    AFTER INSERT OR UPDATE OR DELETE ON appointment_slots
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON TABLE  appointment_slots IS 'Pre-generated bookable time slots per doctor. Status transitions: available → booked | blocked | cancelled. One slot per doctor per start time (hard unique — no soft-delete exemption).';
COMMENT ON COLUMN appointment_slots.doctor_id      IS 'Owning doctor. FK → users(id).';
COMMENT ON COLUMN appointment_slots.slot_start     IS 'UTC timestamp of slot start. Client converts to local timezone for display.';
COMMENT ON COLUMN appointment_slots.duration_mins  IS 'Length of the slot in minutes. Default 15. Must be > 0.';
COMMENT ON COLUMN appointment_slots.status         IS 'available | booked | blocked | cancelled.';
COMMENT ON COLUMN appointment_slots.booked_by      IS 'User (patient or staff) who created the booking. NULL when status != booked.';
COMMENT ON COLUMN appointment_slots.blocked_reason IS 'Free-text reason for the block (e.g. lunch break, admin hold). NULL when status != blocked.';
COMMENT ON COLUMN appointment_slots.version        IS 'Optimistic-lock counter — owned by Hibernate @Version. Trigger does NOT touch this column.';
COMMENT ON COLUMN appointment_slots.deleted_at     IS 'Soft-delete timestamp. NULL = live row.';
