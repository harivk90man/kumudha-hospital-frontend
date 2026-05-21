package com.hospital.management.pharmacy.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PharmacyReturnItemRepository extends JpaRepository<PharmacyReturnItem, UUID> {

    List<PharmacyReturnItem> findByPharmacyReturnId(UUID pharmacyReturnId);

    List<PharmacyReturnItem> findByPharmacySaleItemId(UUID pharmacySaleItemId);

    List<PharmacyReturnItem> findByDrugStockId(UUID drugStockId);
}
