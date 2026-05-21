# registration — Feature

## Package
[patient](../MODULE.md)

## Tables
`patients`, `patient_govt_ids`

## Schema reference
[07 · Patient](../../../../../../../../../../../docs/03-schema/v3/modules/07-patient.html#patients)

## Business rules
- UHID is generated on INSERT using the format locked in `hospital_profile` (`uhid_prefix`, `uhid_separator`, `uhid_sequence_padding`, `uhid_include_year`)
- UHID sequence uses a DB sequence — generated atomically, never reused even on rollback
- `patients.created_via` must be one of `reception`, `app`, `migration` — set at creation, never updated
- `patient_govt_ids` allows multiple ID types per patient but only one active row per `id_type` — partial unique index enforces this
- Mobile number is not unique — same mobile may belong to different patients (family sharing); uniqueness is at UHID level

## API endpoints
_To be defined during implementation._

## Known constraints
- `patients.address` is `jsonb` with a typed POJO `PatientAddress(line1, line2, city, state, pincode, country, landmark)`
- Generated columns `address_pincode` and `address_city` are read-only on the Java side (`@Generated`)
- Minimum required fields for registration: `first_name`, `date_of_birth` (or `age_years`), `gender`, `mobile`
