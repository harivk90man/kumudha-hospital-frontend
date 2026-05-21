package com.hospital.management.radiology.order;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RadiologyAttachmentRepository extends JpaRepository<RadiologyAttachment, UUID> {

    List<RadiologyAttachment> findByRadiologyOrderIdAndDeletedAtIsNullOrderBySequenceNo(UUID radiologyOrderId);
}
