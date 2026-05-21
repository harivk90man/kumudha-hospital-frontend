package com.hospital.management.inventory.stock;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DrugStockLedgerRepository extends JpaRepository<DrugStockLedger, UUID> {

    List<DrugStockLedger> findByDrugStockIdOrderByCreatedAtDesc(UUID drugStockId);

    List<DrugStockLedger> findByMovementTypeOrderByCreatedAtDesc(String movementType);
}
