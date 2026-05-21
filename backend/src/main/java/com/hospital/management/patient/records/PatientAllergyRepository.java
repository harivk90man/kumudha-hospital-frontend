package com.hospital.management.patient.records;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientAllergyRepository extends JpaRepository<PatientAllergy, UUID> {

    List<PatientAllergy> findByPatientIdAndDeletedAtIsNull(UUID patientId);

    boolean existsByPatientIdAndAllergyIdAndDeletedAtIsNull(UUID patientId, UUID allergyId);
}
