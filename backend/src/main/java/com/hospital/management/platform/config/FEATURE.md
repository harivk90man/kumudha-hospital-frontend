# config — Feature

## Package
[platform](../MODULE.md)

## Tables
`system_config`, `user_preferences`, `holidays`

## Schema reference
[01D · Operational Config](../../../../../../../../../../../docs/03-schema/v3/modules/01d-operational-config.html)

## Business rules
- `system_config.config_value` is `jsonb` — each key has a registered POJO shape; app refuses to start if a required key is missing
- `system_config` is L2 maker-checker — config changes require a second approver; used for billing discount thresholds, radiology self-approval flag, etc.
- `holidays` drives appointment slot availability — slots falling on a holiday date are blocked from booking
- `user_preferences` is per-user; keys are a fixed set (UI theme, default department, etc.)

## API endpoints
_To be defined during implementation._

## Known constraints
- `system_config` keys are defined as a Java enum (`ConfigKey`); app validates all enum values have a DB row at startup
- Never read `system_config` per-request — cache with a short TTL (60s); invalidate on UPDATE via DB notify or cache eviction
