package com.hospital.management.clinical.prescription;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PrescriptionItemRepository extends JpaRepository<PrescriptionItem, UUID> {

    List<PrescriptionItem> findByPrescriptionIdAndDeletedAtIsNullOrderBySequenceNo(UUID prescriptionId);

    boolean existsByPrescriptionIdAndMedicineIdAndDeletedAtIsNull(UUID prescriptionId, UUID medicineId);
}
