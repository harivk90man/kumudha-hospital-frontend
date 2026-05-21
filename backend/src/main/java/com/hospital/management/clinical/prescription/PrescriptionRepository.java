package com.hospital.management.clinical.prescription;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PrescriptionRepository extends JpaRepository<Prescription, UUID> {

    Optional<Prescription> findByConsultationIdAndDeletedAtIsNull(UUID consultationId);

    List<Prescription> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    /** Pharmacy workqueue — prescriptions awaiting dispensing. */
    List<Prescription> findByStatusInAndDeletedAtIsNull(List<String> statuses);
}
