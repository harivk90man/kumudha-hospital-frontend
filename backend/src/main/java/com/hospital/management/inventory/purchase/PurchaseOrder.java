package com.hospital.management.inventory.purchase;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Purchase order to a vendor. L2 maker-checker: drafter cannot approve their own PO.
 * total_amount and includes_narcotics are maintained by fn_recompute_po_totals() trigger
 * on purchase_order_items — never set directly by app.
 * status: draft → pending_approval → approved → sent → partially_received → received | cancelled | rejected
 */
@Entity
@Table(name = "purchase_orders")
@Getter
public class PurchaseOrder extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String poNumber;

    @Column(nullable = false, updatable = false)
    private UUID vendorId;

    @Setter @Column
    private LocalDate expectedDate;

    @Setter @Column(nullable = false)
    private String status;

    /** Maintained by fn_recompute_po_totals() trigger — do not set directly. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalAmount;

    @Setter @Column
    private OffsetDateTime receivedAt;

    /** Maintained by fn_recompute_po_totals() trigger — do not set directly. */
    @Column(nullable = false)
    private boolean includesNarcotics;

    // ── L2 maker-checker ──────────────────────────────────────────────────

    @Setter @Column(nullable = false)
    private String approvalStatus;

    @Setter @Column
    private UUID approvedBy;

    @Setter @Column
    private OffsetDateTime approvedAt;

    @Setter @Column
    private String rejectionReason;

    protected PurchaseOrder() {}

    public PurchaseOrder(String poNumber, UUID vendorId, LocalDate expectedDate, UUID createdBy) {
        this.poNumber         = poNumber;
        this.vendorId         = vendorId;
        this.expectedDate     = expectedDate;
        this.status           = "draft";
        this.totalAmount      = BigDecimal.ZERO;
        this.includesNarcotics = false;
        this.approvalStatus   = "pending_approval";
        setCreatedBy(createdBy);
    }

    public void submit(UUID actorId) {
        this.status = "pending_approval";
        setUpdatedBy(actorId);
    }

    public void approve(UUID approver, UUID actorId) {
        this.status         = "approved";
        this.approvalStatus = "approved";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void reject(UUID approver, String reason, UUID actorId) {
        this.status           = "rejected";
        this.approvalStatus   = "rejected";
        this.approvedBy       = approver;
        this.approvedAt       = OffsetDateTime.now();
        this.rejectionReason  = reason;
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.status = "cancelled";
        setUpdatedBy(actorId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PurchaseOrder p)) return false;
        return poNumber != null && poNumber.equals(p.poNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(poNumber); }
}
