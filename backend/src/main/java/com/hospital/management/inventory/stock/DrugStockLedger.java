package com.hospital.management.inventory.stock;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Append-only stock movement ledger. One row per quantity change on a batch.
 * UPDATE and DELETE are blocked by DB trigger — corrections are new adjustment rows.
 * 7-year retention mandated by CDSCO compliance.
 *
 * movement_type drives which source FK column is non-NULL (at most one):
 *   purchase_in       → purchaseOrderItemId
 *   sale_out          → pharmacySaleItemId (FK added in pharmacy module)
 *   return_in/writeoff → pharmacyReturnItemId (FK added in pharmacy module)
 *   transfer_*        → transferCounterpartId (self-FK)
 *   adjustment/others → no source FK, adjustment_reason required for 'adjustment'
 */
@Entity
@Table(name = "drug_stock_ledger")
@Getter
public class DrugStockLedger {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID drugStockId;

    @Column(nullable = false, updatable = false)
    private String movementType;

    @Column(nullable = false, updatable = false)
    private int quantityBefore;

    @Column(nullable = false, updatable = false)
    private int quantityAfter;

    @Column(updatable = false)
    private UUID purchaseOrderItemId;

    /** FK → pharmacy_sale_items(id) RESTRICT — constraint added in pharmacy module migration. */
    @Column(updatable = false)
    private UUID pharmacySaleItemId;

    /** FK → pharmacy_return_items(id) RESTRICT — constraint added in pharmacy module migration. */
    @Column(updatable = false)
    private UUID pharmacyReturnItemId;

    @Column(updatable = false)
    private String adjustmentReason;

    /** Self-FK → drug_stock_ledger(id) RESTRICT — links paired transfer rows. */
    @Column(updatable = false)
    private UUID transferCounterpartId;

    @Column(nullable = false, updatable = false)
    private UUID performedBy;

    @Column(updatable = false)
    private String notes;

    // ── Append-only audit ─────────────────────────────────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    @Version
    @Column(nullable = false)
    private int version;

    @PrePersist
    protected void onInsert() { createdAt = OffsetDateTime.now(); }

    protected DrugStockLedger() {}

    public DrugStockLedger(UUID drugStockId, String movementType,
                           int quantityBefore, int quantityAfter,
                           UUID purchaseOrderItemId, UUID pharmacySaleItemId,
                           UUID pharmacyReturnItemId, String adjustmentReason,
                           UUID transferCounterpartId, UUID performedBy,
                           String notes, UUID createdBy) {
        this.drugStockId           = drugStockId;
        this.movementType          = movementType;
        this.quantityBefore        = quantityBefore;
        this.quantityAfter         = quantityAfter;
        this.purchaseOrderItemId   = purchaseOrderItemId;
        this.pharmacySaleItemId    = pharmacySaleItemId;
        this.pharmacyReturnItemId  = pharmacyReturnItemId;
        this.adjustmentReason      = adjustmentReason;
        this.transferCounterpartId = transferCounterpartId;
        this.performedBy           = performedBy;
        this.notes                 = notes;
        this.createdBy             = createdBy;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DrugStockLedger l)) return false;
        return Objects.equals(id, l.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
