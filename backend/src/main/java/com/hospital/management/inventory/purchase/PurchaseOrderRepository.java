package com.hospital.management.inventory.purchase;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {

    Optional<PurchaseOrder> findByPoNumberAndDeletedAtIsNull(String poNumber);

    List<PurchaseOrder> findByVendorIdAndDeletedAtIsNull(UUID vendorId);

    List<PurchaseOrder> findByStatusInAndDeletedAtIsNull(List<String> statuses);

    List<PurchaseOrder> findByApprovalStatusAndDeletedAtIsNull(String approvalStatus);
}
