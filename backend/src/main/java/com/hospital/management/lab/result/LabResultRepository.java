package com.hospital.management.lab.result;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabResultRepository extends JpaRepository<LabResult, UUID> {

    Optional<LabResult> findByLabOrderItemIdAndDeletedAtIsNull(UUID labOrderItemId);

    /** Verification queue — results awaiting senior review. */
    List<LabResult> findByReleaseStatusAndDeletedAtIsNull(String releaseStatus);

    /** Critical results dashboard — unacknowledged critical flags. */
    List<LabResult> findByFlagInAndDeletedAtIsNull(List<String> flags);

    List<LabResult> findByAmendedFromResultId(UUID amendedFromResultId);
}
