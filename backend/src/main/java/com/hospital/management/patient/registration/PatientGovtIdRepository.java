package com.hospital.management.patient.registration;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientGovtIdRepository extends JpaRepository<PatientGovtId, UUID> {

    List<PatientGovtId> findByPatientIdAndDeletedAtIsNull(UUID patientId);

    Optional<PatientGovtId> findByPatientIdAndIdTypeAndDeletedAtIsNull(UUID patientId, String idType);

    boolean existsByPatientIdAndIdTypeAndDeletedAtIsNull(UUID patientId, String idType);
}
