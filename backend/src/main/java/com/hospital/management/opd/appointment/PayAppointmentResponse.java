package com.hospital.management.opd.appointment;

import java.util.UUID;

/** Wire shape returned by POST /api/appointments/{id}/pay. */
public record PayAppointmentResponse(
        UUID   appointmentId,
        String appointmentNo,
        String opNumber,
        String tokenNumber,
        UUID   patientId,
        UUID   doctorId
) {}
