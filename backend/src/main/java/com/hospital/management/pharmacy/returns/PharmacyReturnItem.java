package com.hospital.management.pharmacy.returns;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Pharmacy return line item. CASCADE child of pharmacy_returns. No soft-delete.
 * AFTER INSERT trigger fn_log_return_movement() reinstates drug_stock.quantity_available
 * and writes a 'return_in' row to drug_stock_ledger.
 */
@Entity
@Table(name = "pharmacy_return_items")
@Getter
public class PharmacyReturnItem {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID pharmacyReturnId;

    @Column(nullable = false, updatable = false)
    private UUID pharmacySaleItemId;

    @Column(nullable = false, updatable = false)
    private UUID drugId;

    @Column(nullable = false, updatable = false)
    private UUID drugStockId;

    @Column(nullable = false, updatable = false)
    private int quantityReturned;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal returnAmount;

    @Column(updatable = false)
    private String notes;

    // ── Inline audit (no soft-delete) ─────────────────────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    private UUID updatedBy;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    @Version @Column(nullable = false)
    private int version;

    @PrePersist  protected void onInsert() { createdAt = OffsetDateTime.now(); updatedAt = createdAt; }
    @PreUpdate   protected void onUpdate() { updatedAt = OffsetDateTime.now(); }
    public void setCreatedBy(UUID v) { this.createdBy = v; }

    protected PharmacyReturnItem() {}

    public PharmacyReturnItem(UUID pharmacyReturnId, UUID pharmacySaleItemId,
                              UUID drugId, UUID drugStockId, int quantityReturned,
                              BigDecimal unitPrice, BigDecimal returnAmount,
                              String notes, UUID createdBy) {
        this.pharmacyReturnId   = pharmacyReturnId;
        this.pharmacySaleItemId = pharmacySaleItemId;
        this.drugId             = drugId;
        this.drugStockId        = drugStockId;
        this.quantityReturned   = quantityReturned;
        this.unitPrice          = unitPrice;
        this.returnAmount       = returnAmount;
        this.notes              = notes;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PharmacyReturnItem i)) return false;
        return Objects.equals(pharmacyReturnId, i.pharmacyReturnId)
            && Objects.equals(pharmacySaleItemId, i.pharmacySaleItemId);
    }

    @Override
    public int hashCode() { return Objects.hash(pharmacyReturnId, pharmacySaleItemId); }
}
