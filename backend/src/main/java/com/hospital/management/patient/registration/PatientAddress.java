package com.hospital.management.patient.registration;

public record PatientAddress(
        String line1,
        String line2,
        String city,
        String state,
        String pincode,
        String country,
        String landmark
) {}
