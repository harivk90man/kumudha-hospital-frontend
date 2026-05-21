package com.hospital.management.inventory.purchase;

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
 * Line item on a purchase order. CASCADE child of purchase_orders.
 * No soft-delete — items are physically removed with their PO (CASCADE).
 * GST split: CGST + SGST for intra-state, IGST for inter-state (mutually exclusive).
 * total_price triggers fn_recompute_po_totals() which updates purchase_orders.total_amount.
 */
@Entity
@Table(name = "purchase_order_items")
@Getter
public class PurchaseOrderItem {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID purchaseOrderId;

    @Column(nullable = false, updatable = false)
    private UUID drugId;

    @Setter @Column(nullable = false)
    private int quantityOrdered;

    @Setter @Column(nullable = false)
    private int quantityReceived;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

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

    @Version
    @Column(nullable = false)
    private int version;

    @PrePersist
    protected void onInsert() { createdAt = OffsetDateTime.now(); updatedAt = createdAt; }

    @PreUpdate
    protected void onUpdate() { updatedAt = OffsetDateTime.now(); }

    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public void setUpdatedBy(UUID updatedBy) { this.updatedBy = updatedBy; }

    protected PurchaseOrderItem() {}

    public PurchaseOrderItem(UUID purchaseOrderId, UUID drugId, int quantityOrdered,
                             BigDecimal unitPrice, BigDecimal totalPrice, UUID createdBy) {
        this.purchaseOrderId  = purchaseOrderId;
        this.drugId           = drugId;
        this.quantityOrdered  = quantityOrdered;
        this.quantityReceived = 0;
        this.unitPrice        = unitPrice;
        this.cgstPct          = BigDecimal.ZERO;
        this.cgstAmount       = BigDecimal.ZERO;
        this.sgstPct          = BigDecimal.ZERO;
        this.sgstAmount       = BigDecimal.ZERO;
        this.igstPct          = BigDecimal.ZERO;
        this.igstAmount       = BigDecimal.ZERO;
        this.totalPrice       = totalPrice;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PurchaseOrderItem i)) return false;
        return Objects.equals(purchaseOrderId, i.purchaseOrderId) && Objects.equals(drugId, i.drugId);
    }

    @Override
    public int hashCode() { return Objects.hash(purchaseOrderId, drugId); }
}
