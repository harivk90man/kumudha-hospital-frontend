package com.hospital.management.patient;

import java.util.UUID;

/**
 * Cross-package interface exposed by the patient bounded context.
 * Other packages (opd, clinical, lab, billing) call this to look up patients
 * without importing Patient entity directly.
 * When patient is extracted to a microservice, this becomes an HTTP client.
 */
public interface PatientQueryService {

    PatientSummary getById(UUID patientId);

    PatientSummary getByUhid(String uhid);

    boolean isActive(UUID patientId);
}
