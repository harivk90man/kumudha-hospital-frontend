-- ============================================================
-- V70__add_is_primary_to_user_roles.sql
-- Adds is_primary flag to user_roles.
-- Exactly one active row per user must be primary — enforced by
-- partial unique index uq_user_roles_primary.
-- The primary role drives the login response and UI portal routing.
-- Schema ref: docs/03-schema/v3/modules/01c-rbac.html#user_roles
-- ============================================================

ALTER TABLE user_roles
    ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

-- At most one primary role per user (user_roles has no soft-delete — hard-delete only)
CREATE UNIQUE INDEX uq_user_roles_primary
    ON user_roles (user_id)
    WHERE is_primary = true;

COMMENT ON COLUMN user_roles.is_primary IS 'True on exactly one active row per user. Identifies the role returned in the login response and used for UI portal routing. Enforced by uq_user_roles_primary partial unique index.';

-- Backfill: mark the first (earliest) role assignment as primary for every user
-- that has at least one active role but no primary yet.
-- Uses a window function to pick the oldest active row per user.
UPDATE user_roles ur
SET    is_primary = true
WHERE  (ur.user_id, ur.role_id) IN (
    SELECT user_id, role_id
    FROM (
        SELECT user_id,
               role_id,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
        FROM   user_roles
    ) ranked
    WHERE rn = 1
);
