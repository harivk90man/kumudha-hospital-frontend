package com.hospital.management.opd.appointment;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * PATCH /api/appointments/{id} — all fields optional; only non-null values are applied.
 * Guard: no OP visit must exist and current scheduledAt must be >= today.
 */
public record UpdateAppointmentRequest(
        UUID patientId,
        UUID doctorId,
        OffsetDateTime scheduledAt
) {}
