package com.hospital.management.inventory.stock;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DrugStockRepository extends JpaRepository<DrugStock, UUID> {

    /** FEFO order — earliest-expiry available batch first. */
    List<DrugStock> findByDrugIdAndIsBlockedFalseAndQuantityAvailableGreaterThanOrderByExpiryDate(
            UUID drugId, int minQty);

    /** Expiry alert — batches expiring within N days. */
    List<DrugStock> findByIsBlockedFalseAndExpiryDateBefore(LocalDate cutoff);

    List<DrugStock> findByDrugIdAndIsBlockedFalse(UUID drugId);
}
