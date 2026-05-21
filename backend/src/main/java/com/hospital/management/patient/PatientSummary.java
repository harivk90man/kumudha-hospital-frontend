package com.hospital.management.patient;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Minimal patient projection used by other packages via PatientQueryService.
 * Other packages hold only this — they never import the Patient entity directly.
 */
public record PatientSummary(
        UUID      id,
        String    uhid,
        String    fullName,
        LocalDate dateOfBirth,
        String    gender,
        String    mobile,
        boolean   isDeceased
) {}
