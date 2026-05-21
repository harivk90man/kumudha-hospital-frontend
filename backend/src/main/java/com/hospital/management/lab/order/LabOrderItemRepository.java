package com.hospital.management.lab.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabOrderItemRepository extends JpaRepository<LabOrderItem, UUID> {

    List<LabOrderItem> findByLabOrderIdAndDeletedAtIsNull(UUID labOrderId);

    List<LabOrderItem> findBySampleIdAndDeletedAtIsNull(UUID sampleId);

    boolean existsByLabOrderIdAndLabTestIdAndDeletedAtIsNull(UUID labOrderId, UUID labTestId);
}
