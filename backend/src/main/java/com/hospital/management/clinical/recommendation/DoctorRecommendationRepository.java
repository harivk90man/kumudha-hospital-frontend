package com.hospital.management.clinical.recommendation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DoctorRecommendationRepository extends JpaRepository<DoctorRecommendation, UUID> {

    List<DoctorRecommendation> findByConsultationId(UUID consultationId);

    List<DoctorRecommendation> findByPatientIdAndStatusAndDeletedAtIsNull(UUID patientId, String status);

    /** Open worklist ordered by priority and creation time. */
    List<DoctorRecommendation> findByStatusAndDeletedAtIsNullOrderByPriorityAscCreatedAtAsc(String status);
}
