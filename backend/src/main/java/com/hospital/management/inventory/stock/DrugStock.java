package com.hospital.management.inventory.stock;

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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Per-batch inventory record. No soft-delete — is_blocked gates dispensing instead.
 * FEFO (First Expiry First Out): pharmacy picks the batch with the earliest expiry_date.
 * is_blocked is set by the nightly expiry job (expired) or manual quality action.
 * blocked_reason: expired | recalled | damaged | quality_hold
 */
@Entity
@Table(name = "drug_stock")
@Getter
public class DrugStock {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID drugId;

    @Column(nullable = false, updatable = false)
    private String batchNumber;

    @Column(updatable = false)
    private LocalDate mfgDate;

    @Column(nullable = false, updatable = false)
    private LocalDate expiryDate;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal purchasePrice;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal mrp;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal sellingPrice;

    @Column(nullable = false, updatable = false)
    private int quantityReceived;

    @Setter @Column(nullable = false)
    private int quantityAvailable;

    @Column(nullable = false, updatable = false)
    private UUID vendorId;

    @Column(updatable = false)
    private UUID purchaseOrderId;

    @Column(nullable = false, updatable = false)
    private LocalDate receivedDate;

    @Setter @Column(nullable = false)
    private boolean isBlocked;

    @Setter @Column
    private String blockedReason;

    // ── Inline audit (no soft-delete) ─────────────────────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    private UUID updatedBy;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(nullable = false)
    private int version;

    @PrePersist
    protected void onInsert() { createdAt = OffsetDateTime.now(); updatedAt = createdAt; }

    @PreUpdate
    protected void onUpdate() { updatedAt = OffsetDateTime.now(); }

    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public void setUpdatedBy(UUID updatedBy) { this.updatedBy = updatedBy; }

    protected DrugStock() {}

    public DrugStock(UUID drugId, String batchNumber, LocalDate mfgDate, LocalDate expiryDate,
                     BigDecimal purchasePrice, BigDecimal mrp, BigDecimal sellingPrice,
                     int quantityReceived, UUID vendorId, UUID purchaseOrderId,
                     LocalDate receivedDate, UUID createdBy) {
        this.drugId           = drugId;
        this.batchNumber      = batchNumber;
        this.mfgDate          = mfgDate;
        this.expiryDate       = expiryDate;
        this.purchasePrice    = purchasePrice;
        this.mrp              = mrp;
        this.sellingPrice     = sellingPrice;
        this.quantityReceived = quantityReceived;
        this.quantityAvailable = quantityReceived;
        this.vendorId         = vendorId;
        this.purchaseOrderId  = purchaseOrderId;
        this.receivedDate     = receivedDate;
        this.isBlocked        = false;
        setCreatedBy(createdBy);
    }

    public void block(String reason, UUID actorId) {
        this.isBlocked    = true;
        this.blockedReason = reason;
        setUpdatedBy(actorId);
    }

    public boolean isAvailable() { return !isBlocked && quantityAvailable > 0; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DrugStock s)) return false;
        return Objects.equals(drugId, s.drugId)
            && Objects.equals(batchNumber, s.batchNumber)
            && Objects.equals(vendorId, s.vendorId);
    }

    @Override
    public int hashCode() { return Objects.hash(drugId, batchNumber, vendorId); }
}
