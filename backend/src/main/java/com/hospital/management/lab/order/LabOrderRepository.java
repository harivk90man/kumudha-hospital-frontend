package com.hospital.management.lab.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabOrderRepository extends JpaRepository<LabOrder, UUID> {

    Optional<LabOrder> findByOrderNumberAndDeletedAtIsNull(String orderNumber);

    List<LabOrder> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    List<LabOrder> findByOpVisitIdAndDeletedAtIsNull(UUID opVisitId);

    /** Lab worklist — orders awaiting processing. */
    List<LabOrder> findByStatusInAndDeletedAtIsNull(List<String> statuses);
}
