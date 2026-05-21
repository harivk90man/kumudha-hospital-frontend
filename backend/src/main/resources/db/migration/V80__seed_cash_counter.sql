-- ============================================================
-- V80__seed_cash_counter.sql
-- Seeds the Front Desk counter for Kumudha Hospital.
-- Fixed UUID so it can be referenced in curl/dev testing
-- without needing a separate lookup call.
-- UUID: cafecafe-cafe-7afe-8afe-cafecafecafe
-- ============================================================

INSERT INTO cash_counters (id, counter_code, counter_name, location, created_by)
VALUES (
    'cafecafe-cafe-7afe-8afe-cafecafecafe',
    'FD',
    'Front Desk Counter',
    'Ground Floor, Reception',
    '00000000-0000-0000-0000-000000000000'
) ON CONFLICT DO NOTHING;
