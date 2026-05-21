package com.hospital.management.opd.appointment;

import java.util.UUID;

/** Minimal doctor info returned by GET /api/doctors for booking-form dropdowns. */
public record DoctorSummary(
        UUID   id,
        String name,
        String department
) {}
