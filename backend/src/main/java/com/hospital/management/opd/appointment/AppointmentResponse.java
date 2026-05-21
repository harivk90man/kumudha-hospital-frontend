package com.hospital.management.opd.appointment;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire shape for POST /api/appointments, PATCH …/arrive, POST …/cancel.
 * Patient and doctor info are embedded so the caller doesn't need extra
 * round-trips. JSON field names match the frontend Appointment interface 1:1.
 */
public record AppointmentResponse(
        UUID   id,
        String appointmentNo,

        /** Embedded patient brief — matches frontend PatientSummary shape. */
        PatientBrief patient,

        UUID   doctorId,
        String doctorName,
        /** doctor_profiles.specialization — used as the department label. */
        String department,

        String slotId,

        /** ISO date — YYYY-MM-DD derived from scheduledAt. */
        String slotDate,
        /** HH:mm derived from scheduledAt in system timezone. */
        String slotTime,

        String source,
        String status,
        String visitType,
        String chiefComplaint,

        /** Consultation token number — null until payment is taken (POST …/pay). */
        String tokenNumber,

        OffsetDateTime bookedAt,
        OffsetDateTime cancelledAt
) {
    public record PatientBrief(
            UUID   id,
            String uhid,
            String fullName,
            String gender,
            int    ageYears,
            String mobile,
            String bloodGroup,
            List<AllergenRef> allergies
    ) {}

    public record AllergenRef(String allergen) {}
}
