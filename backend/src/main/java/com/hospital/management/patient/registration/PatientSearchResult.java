package com.hospital.management.patient.registration;

import java.util.UUID;

/**
 * Slim patient projection returned by search endpoints.
 * Does NOT include allergies or chronic conditions — those load on the full profile.
 * Matches the frontend PatientSummary interface (allergies/chronicConditions are optional there).
 */
public record PatientSearchResult(
        UUID   id,
        String uhid,
        String firstName,
        String lastName,
        String fullName,
        String gender,
        int    ageYears,
        String dateOfBirth,
        String mobile,
        String bloodGroup
) {}
