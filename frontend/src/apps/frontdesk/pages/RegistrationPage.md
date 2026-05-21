# RegistrationPage (front-desk)

**File:** [RegistrationPage.tsx](RegistrationPage.tsx) · **Route:** `/frontdesk/register` · **Auth:** required

## Purpose
Single-screen reception flow per BRD §1 steps 2-5:

1. **Search** by UHID (direct) or mobile (may return multiple — disambiguate by name).
2. **New patient** → register form (name, gender, DOB, mobile, address, blood group, allergies, chronics).
3. **Existing patient** → confirm UHID + identity at counter.
4. **Pick department + doctor** (from `appointments.fetchBookableDoctors`).
5. **Mark consultation fee paid** (Phase 1 placeholder; counter-pay model — no invoice row yet).
6. **Issue token + create op_visit** via `encounter.createOpVisit`.
7. Patient now appears on the **Vitals** queue (state `120 awaiting_vitals`).

## Sections
| Section | Notes |
|---------|-------|
| Step 1 — Identify | Tab strip: **Look up existing** (UHID exact / mobile last-6) vs **Register new** (full form). |
| Search results | List of matched patients with allergy pill; "Use this patient" button. Multi-match shows family-disambiguation hint. |
| New-patient form | Inline `<Card>` form with `<FormInput>` + `<FormSelect>` for all required `patients` columns + optional address / allergies / chronics. |
| Step 2 — Visit details | Doctor `<FormSelect>` (from `fetchBookableDoctors`) + chief complaint `<FormTextarea>`. Submit issues token via `createOpVisit`. |
| Step 3 — Done | "Token issued" confirmation card with OP number / token / initial state pill + "Register another" or "Open vitals queue" buttons. |

## Schemas
- [registrationSchema.ts](../schemas/registrationSchema.ts) — `newPatientSchema` + `visitDetailsSchema` (zod).

## Data
- `searchPatientsByMobile(mobile)` and `fetchPatient(uhid)` from `@/features/patient`.
- `findLinkedPatients(uhid)` for the family chip.
- `createPatient(input)` for new registration.
- `fetchBookableDoctors()` from `@/features/appointments`.
- `createOpVisit(input)` from `@/features/encounter`.

## Spec mapping
- TSD-03 §4.1 `patients` insert.
- TSD-06 §4.1 `op_visits` insert.
- BRD Patient Identity Model — UHID + mobile lookup with family-link disambiguation.
