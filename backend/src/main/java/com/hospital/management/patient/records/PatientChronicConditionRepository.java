package com.hospital.management.patient.records;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientChronicConditionRepository extends JpaRepository<PatientChronicCondition, UUID> {

    List<PatientChronicCondition> findByPatientIdAndDeletedAtIsNull(UUID patientId);

    List<PatientChronicCondition> findByPatientIdAndIsResolvedFalseAndDeletedAtIsNull(UUID patientId);

    boolean existsByPatientIdAndConditionIdAndDeletedAtIsNull(UUID patientId, UUID conditionId);
}
