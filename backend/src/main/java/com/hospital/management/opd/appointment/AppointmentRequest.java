package com.hospital.management.opd.appointment;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Wire shape for POST /api/appointments.
 *
 * source values: walk_in | phone | online | referral
 * visitType values: new | follow_up | emergency | procedure
 *
 * chiefComplaint: optional for pre-booked slots (captured at check-in).
 * scheduledAt: optional — defaults to now() for walk-in bookings.
 * slotId: optional — NULL for walk-in or phone bookings without a pre-allocated slot.
 */
public record AppointmentRequest(

        @NotNull UUID patientId,
        @NotNull UUID doctorId,

        String chiefComplaint,

        @NotNull
        @Pattern(regexp = "new|follow_up|emergency|procedure",
                 message = "visitType must be: new, follow_up, emergency, or procedure")
        String visitType,

        @NotNull
        @Pattern(regexp = "walk_in|phone|online|referral",
                 message = "source must be: walk_in, phone, online, or referral")
        String source,

        /** Defaults to now() when null; for pre-booked slots pass the slot's scheduled time. */
        OffsetDateTime scheduledAt,

        /** FK → appointment_slots(id). Null for walk-in / phone bookings. */
        UUID slotId
) {}
