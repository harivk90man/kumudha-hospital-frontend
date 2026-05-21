package com.hospital.management.clinical.vitals;

import java.math.BigDecimal;

/**
 * Wire body for POST /api/visits/{opNumber}/vitals.
 * All measurement fields are optional — only captured values are sent.
 * chiefComplaint updates op_visits.chief_complaint if provided.
 */
record VitalsRequest(
        Integer     bpSystolic,
        Integer     bpDiastolic,
        Integer     pulseRate,
        Integer     spo2,
        BigDecimal  temperatureF,
        Integer     respiratoryRate,
        BigDecimal  weightKg,
        BigDecimal  heightCm,
        Integer     bloodSugarRandom,
        Integer     painScore,
        String      notes,
        String      chiefComplaint
) {}
