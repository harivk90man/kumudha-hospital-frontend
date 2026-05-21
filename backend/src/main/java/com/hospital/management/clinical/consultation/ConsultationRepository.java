package com.hospital.management.clinical.consultation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface ConsultationRepository extends JpaRepository<Consultation, UUID> {

    Optional<Consultation> findByOpVisitIdAndDeletedAtIsNull(UUID opVisitId);

    List<Consultation> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    List<Consultation> findByDoctorIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID doctorId);

    List<Consultation> findByFollowUpRequiredTrueAndFollowUpDateAndDeletedAtIsNull(LocalDate followUpDate);
}
