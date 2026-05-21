package com.hospital.management.pharmacy.dispensing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PharmacySaleItemRepository extends JpaRepository<PharmacySaleItem, UUID> {

    List<PharmacySaleItem> findByPharmacySaleId(UUID pharmacySaleId);

    List<PharmacySaleItem> findByPrescriptionItemId(UUID prescriptionItemId);

    List<PharmacySaleItem> findByDrugStockId(UUID drugStockId);
}
