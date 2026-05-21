package com.hospital.management.patient.registration;

import java.util.List;
import java.util.UUID;

/**
 * Response for POST /api/patients and GET /api/patients/:uhid.
 * Matches the frontend PatientSummary interface exactly.
 */
public record PatientRegistrationResponse(
        UUID   id,
        String uhid,
        String firstName,
        String lastName,
        String fullName,
        String gender,
        int    ageYears,
        String dateOfBirth,
        String mobile,
        String altMobile,
        String email,
        String bloodGroup,
        PatientAddress address,
        List<AllergyDto> allergies,
        List<String> chronicConditions
) {
    public record AllergyDto(String allergen, String drugClassCode) {}
}
