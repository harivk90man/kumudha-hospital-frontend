-- ============================================================
-- V18__add_user_profile_picture.sql
-- Adds profile_picture column to users table.
-- Stored as bytea in DB — for Phase 1 volume this is acceptable.
-- Migrate to object storage path at scale.
-- ============================================================

ALTER TABLE users ADD COLUMN profile_picture bytea;

COMMENT ON COLUMN users.profile_picture IS 'Staff profile photo stored as binary. NULL = no photo uploaded.';
