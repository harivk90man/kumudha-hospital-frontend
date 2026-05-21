-- ============================================================
-- V80__na_user_add_cashier_role.sql
-- Adds cashier as a secondary role to EMP102 (n.a / Demo Nurse)
-- so a single front-desk user can open cash sessions and collect
-- payments without a separate cashier login.
-- ============================================================

INSERT INTO user_roles (user_id, role_id, is_primary, created_by)
SELECT u.id, r.id, FALSE, '00000000-0000-0000-0000-000000000000'
FROM   users u, roles r
WHERE  u.username    = 'n.a'
  AND  r.role_code   = 'cashier'
  AND  u.deleted_at IS NULL
  AND  r.deleted_at IS NULL
ON CONFLICT DO NOTHING;
