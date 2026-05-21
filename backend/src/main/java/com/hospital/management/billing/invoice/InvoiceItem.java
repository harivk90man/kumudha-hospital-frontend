package com.hospital.management.billing.invoice;

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
 * Invoice line item. CASCADE child of invoices. No soft-delete.
 * fn_recompute_invoice_totals() AFTER INSERT/UPDATE/DELETE trigger keeps the
 * parent invoice's subtotal, totalLineDiscount, totalTax, totalAmount in sync.
 *
 * At most one clinical source FK is non-NULL per row (enforced by DB CHECK).
 * item_type drives which source FK column is expected to be set:
 *   consultation       → consultationId
 *   lab_test/lab_panel → labOrderItemId
 *   radiology          → radiologyOrderId
 *   drug               → pharmacySaleItemId
 *   room_charge        → bedAssignmentId (FK added in IP module)
 *   surgery            → surgeryScheduleId (FK added in IP module)
 *   others             → no source FK required
 *
 * itemName snapshots the service name at billing time — preserved if service is later renamed.
 */
@Entity
@Table(name = "invoice_items")
@Getter
public class InvoiceItem {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID invoiceId;

    @Column(updatable = false)
    private UUID serviceId;

    @Column(nullable = false, updatable = false)
    private String itemType;

    @Column(nullable = false, updatable = false)
    private String itemName;

    @Column(nullable = false, updatable = false)
    private int sequenceNo;

    @Column(updatable = false)
    private UUID consultationId;

    @Column(updatable = false)
    private UUID labOrderItemId;

    @Column(updatable = false)
    private UUID radiologyOrderId;

    @Column(updatable = false)
    private UUID pharmacySaleItemId;

    /** FK → bed_assignments(id) RESTRICT — constraint added in IP module migration. */
    @Column(updatable = false)
    private UUID bedAssignmentId;

    /** FK → surgery_schedules(id) RESTRICT — constraint added in IP module migration. */
    @Column(updatable = false)
    private UUID surgeryScheduleId;

    @Setter @Column(nullable = false)
    private int quantity;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal lineDiscountPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal lineDiscountAmount;

    @Setter @Column
    private String lineDiscountReason;

    @Setter @Column
    private UUID lineDiscountApprovedBy;

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

    protected InvoiceItem() {}

    public InvoiceItem(UUID invoiceId, UUID serviceId, String itemType, String itemName,
                       int sequenceNo, int quantity, BigDecimal unitPrice,
                       BigDecimal totalPrice, UUID sourceId, UUID createdBy) {
        this.invoiceId          = invoiceId;
        this.serviceId          = serviceId;
        this.itemType           = itemType;
        this.itemName           = itemName;
        this.sequenceNo         = sequenceNo;
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
        assignSource(itemType, sourceId);
        setCreatedBy(createdBy);
    }

    private void assignSource(String type, UUID sourceId) {
        switch (type) {
            case "consultation"              -> this.consultationId    = sourceId;
            case "lab_test", "lab_panel"     -> this.labOrderItemId   = sourceId;
            case "radiology"                 -> this.radiologyOrderId  = sourceId;
            case "drug"                      -> this.pharmacySaleItemId = sourceId;
            case "room_charge"               -> this.bedAssignmentId  = sourceId;
            case "surgery"                   -> this.surgeryScheduleId = sourceId;
            default                          -> { /* no source FK for nursing/procedure/consumable/ambulance/other */ }
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof InvoiceItem i)) return false;
        return Objects.equals(invoiceId, i.invoiceId) && sequenceNo == i.sequenceNo;
    }

    @Override
    public int hashCode() { return Objects.hash(invoiceId, sequenceNo); }
}
