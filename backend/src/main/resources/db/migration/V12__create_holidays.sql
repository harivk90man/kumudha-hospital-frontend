-- ============================================================
-- V12__create_holidays.sql
-- Schema ref: docs/03-schema/v3/modules/01d-operational-config.html#holidays
-- ============================================================

CREATE TABLE holidays (
    id            uuid        NOT NULL DEFAULT uuidv7(),
    holiday_date  date        NOT NULL,
    holiday_name  text        NOT NULL,
    description   text,
    recurring     boolean     NOT NULL DEFAULT FALSE,
    created_by    uuid        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    uuid,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    version       int         NOT NULL DEFAULT 0,
    deleted_at    timestamptz,
    deleted_by    uuid,

    CONSTRAINT pk_holidays PRIMARY KEY (id)
);

CREATE UNIQUE INDEX uq_holidays_date_name
    ON holidays (holiday_date, holiday_name) WHERE deleted_at IS NULL;

CREATE INDEX ix_holidays_date
    ON holidays (holiday_date) WHERE deleted_at IS NULL;

CREATE TRIGGER tr_holidays_bu_touch
    BEFORE UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated();

COMMENT ON TABLE  holidays IS 'Hospital holidays. Appointment slot generation skips these dates.';
COMMENT ON COLUMN holidays.recurring IS 'TRUE = same date repeats every year (e.g. Independence Day).';
COMMENT ON COLUMN holidays.version   IS 'Owned by Hibernate @Version.';
