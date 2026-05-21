package com.hospital.management.pharmacy.dispensing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Pharmacy sale line item. CASCADE child of pharmacy_sales. No soft-delete.
 * BEFORE INSERT trigger validates batch availability (not blocked, not expired).
 * AFTER INSERT triggers: decrement drug_stock.quantity_available, write drug_stock_ledger row.
 * drugStockId drives FEFO accounting and maps to the specific batch dispensed.
 */
@Entity
@Table(name = "pharmacy_sale_items")
@Getter
public class PharmacySaleItem {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID pharmacySaleId;

    @Column(nullable = false, updatable = false)
    private UUID drugId;

    @Column(nullable = false, updatable = false)
    private UUID drugStockId;

    @Column(updatable = false)
    private UUID prescriptionItemId;

    @Column(nullable = false, updatable = false)
    private int quantity;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal lineDiscountPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal lineDiscountAmount;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal cgstPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal cgstAmount;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal sgstPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal sgstAmount;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal igstPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal igstAmount;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalPrice;

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
    public void setUpdatedBy(UUID v) { this.updatedBy = v; }

    protected PharmacySaleItem() {}

    public PharmacySaleItem(UUID pharmacySaleId, UUID drugId, UUID drugStockId,
                            UUID prescriptionItemId, int quantity, BigDecimal unitPrice,
                            BigDecimal totalPrice, UUID createdBy) {
        this.pharmacySaleId     = pharmacySaleId;
        this.drugId             = drugId;
        this.drugStockId        = drugStockId;
        this.prescriptionItemId = prescriptionItemId;
        this.quantity           = quantity;
        this.unitPrice          = unitPrice;
        this.lineDiscountPct    = BigDecimal.ZERO;
        this.lineDiscountAmount = BigDecimal.ZERO;
        this.cgstPct            = BigDecimal.ZERO;
        this.cgstAmount         = BigDecimal.ZERO;
        this.sgstPct            = BigDecimal.ZERO;
        this.sgstAmount         = BigDecimal.ZERO;
        this.igstPct            = BigDecimal.ZERO;
        this.igstAmount         = BigDecimal.ZERO;
        this.totalPrice         = totalPrice;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PharmacySaleItem i)) return false;
        return Objects.equals(pharmacySaleId, i.pharmacySaleId)
            && Objects.equals(drugId, i.drugId)
            && Objects.equals(drugStockId, i.drugStockId);
    }

    @Override
    public int hashCode() { return Objects.hash(pharmacySaleId, drugId, drugStockId); }
}
