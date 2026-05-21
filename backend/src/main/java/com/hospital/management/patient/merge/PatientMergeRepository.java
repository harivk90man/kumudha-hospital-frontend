package com.hospital.management.patient.merge;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientMergeRepository extends JpaRepository<PatientMerge, UUID> {

    List<PatientMerge> findByApprovalStatusAndDeletedAtIsNull(String approvalStatus);

    Optional<PatientMerge> findBySecondaryPatientIdAndDeletedAtIsNull(UUID secondaryPatientId);

    boolean existsBySecondaryPatientIdAndApprovalStatusAndDeletedAtIsNull(
            UUID secondaryPatientId, String approvalStatus);
}
