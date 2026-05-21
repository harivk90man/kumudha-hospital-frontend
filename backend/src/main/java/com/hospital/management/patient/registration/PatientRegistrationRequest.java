package com.hospital.management.patient.registration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;
import java.util.List;

/**
 * Wire body for POST /api/patients.
 * Field names match DB columns (camelCase of snake_case) per project naming rule.
 */
public record PatientRegistrationRequest(

        @NotBlank String firstName,
        @NotBlank String lastName,

        @NotNull
        @Pattern(regexp = "m|f|o", message = "must be m, f, or o")
        String gender,

        @NotNull LocalDate dateOfBirth,

        @NotBlank String mobile,

        String altMobile,
        String email,
        String bloodGroup,

        PatientAddress address,

        String aadhaar,
        String pan,

        List<String> allergies,
        List<String> chronicConditions
) {}
