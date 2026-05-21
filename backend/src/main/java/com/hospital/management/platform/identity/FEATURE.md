# identity — Feature

## Package
[platform](../MODULE.md)

## Tables
`hospital_profile`, `users`, `user_sessions`, `departments`, `doctor_profiles`

## Schema reference
[01A · Identity & Auth](../../../../../../../../../../../docs/03-schema/v3/modules/01a-identity-and-auth.html) ·
[01B · Organisation](../../../../../../../../../../../docs/03-schema/v3/modules/01b-organisation.html)

## Business rules
- `hospital_profile` is a singleton — one row enforced by partial unique index; read once at startup, cached
- `users.status` must be `active` for login; `locked_until` blocks login if set
- `user_sessions.refresh_token` is rotated on every use — old token invalidated immediately
- `doctor_profiles.consultation_fee` and `follow_up_fee` are the source of truth for consultation pricing (not `services` table)
- `doctor_profiles.available_days` JSON shape: `{"mon":[{"from":"HH:MM","to":"HH:MM"}], ...}`

## API endpoints
_To be defined during implementation._

## Known constraints
- Password hash uses bcrypt (min cost 12)
- `mfa_secret` stored encrypted at application level — not plaintext in DB
- Soft-delete (`deleted_at`) on users does not cascade to sessions — a background job expires them
