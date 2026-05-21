package com.hospital.management.opd.queue;

import com.hospital.management.opd.appointment.AppointmentResponse;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One row in the live queue — patient in any of the three pre-consultation states.
 * queueStatus: pending_payment | awaiting_vitals | awaiting_doctor
 *
 * opNumber and tokenNumber are null when queueStatus = pending_payment.
 * appointmentId/appointmentNo are null for walk-in op_visits with no prior appointment.
 */
public record QueueEntry(
        UUID   appointmentId,
        String appointmentNo,
        String opNumber,
        String tokenNumber,
        AppointmentResponse.PatientBrief patient,
        UUID   doctorId,
        String doctorName,
        String department,
        OffsetDateTime scheduledAt,
        String queueStatus,
        OffsetDateTime waitingSince
) {}
