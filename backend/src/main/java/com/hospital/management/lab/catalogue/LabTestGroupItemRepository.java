package com.hospital.management.lab.catalogue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabTestGroupItemRepository extends JpaRepository<LabTestGroupItem, UUID> {

    List<LabTestGroupItem> findByGroupIdAndDeletedAtIsNullOrderBySequenceNo(UUID groupId);

    boolean existsByGroupIdAndLabTestIdAndDeletedAtIsNull(UUID groupId, UUID labTestId);
}
