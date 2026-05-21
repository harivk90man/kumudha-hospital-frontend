package com.hospital.management.radiology.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RadiologyOrderRepository extends JpaRepository<RadiologyOrder, UUID> {

    Optional<RadiologyOrder> findByOrderNumberAndDeletedAtIsNull(String orderNumber);

    List<RadiologyOrder> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    List<RadiologyOrder> findByOpVisitIdAndDeletedAtIsNull(UUID opVisitId);

    /** Radiology worklist — orders not yet released or cancelled. */
    List<RadiologyOrder> findByStatusNotInAndDeletedAtIsNull(List<String> excludedStatuses);
}
