package com.hospital.management.radiology.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RadiologyReportRepository extends JpaRepository<RadiologyReport, UUID> {

    Optional<RadiologyReport> findByRadiologyOrderIdAndReleaseStatusNotAndDeletedAtIsNull(
            UUID radiologyOrderId, String excludedStatus);

    /** Verification queue — reports awaiting senior radiologist approval. */
    List<RadiologyReport> findByReleaseStatusAndDeletedAtIsNull(String releaseStatus);

    List<RadiologyReport> findByReportedByRadiologistIdAndDeletedAtIsNullOrderByDictatedAtDesc(
            UUID reportedByRadiologistId);

    List<RadiologyReport> findByAmendedFromReportIdAndDeletedAtIsNull(UUID amendedFromReportId);
}
