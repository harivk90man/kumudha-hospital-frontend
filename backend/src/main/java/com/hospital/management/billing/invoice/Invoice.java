package com.hospital.management.billing.invoice;

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
 * Billing invoice header.
 *
 * GENERATED columns (insertable=false, updatable=false — never written by app):
 *   totalDiscount = totalLineDiscount + billDiscountAmount
 *   balance       = totalAmount - amountPaid
 *
 * totals (subtotal, totalLineDiscount, totalTax, totalAmount) are recomputed by
 * fn_recompute_invoice_totals() trigger on invoice_items changes.
 *
 * L2 maker-checker: discounts above system_config threshold require approval.
 * Separation of duties: createdBy ≠ approvedBy (DB CHECK).
 *
 * paymentStatus: draft → finalized → paid | partially_paid | refunded | cancelled
 */
@Entity
@Table(name = "invoices")
@Getter
public class Invoice extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String invoiceNumber;

    @Column(nullable = false, updatable = false)
    private String invoiceType;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(updatable = false)
    private UUID opVisitId;

    /** FK → ip_admissions(id) RESTRICT — constraint added in IP module migration. */
    @Column(updatable = false)
    private UUID ipAdmissionId;

    @Column(nullable = false)
    private LocalDate invoiceDate;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalLineDiscount;

    @Setter @Column(precision = 4, scale = 2)
    private BigDecimal billDiscountPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal billDiscountAmount;

    @Setter @Column
    private String billDiscountReason;

    @Setter @Column
    private String billDiscountCategory;

    /** GENERATED ALWAYS AS (total_line_discount + bill_discount_amount) STORED */
    @Column(nullable = false, insertable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal totalDiscount;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalTax;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalAmount;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amountPaid;

    /** GENERATED ALWAYS AS (total_amount - amount_paid) STORED */
    @Column(nullable = false, insertable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal balance;

    @Setter @Column(nullable = false)
    private String paymentStatus;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal insuranceCoveredAmount;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal patientCopayAmount;

    @Setter @Column
    private OffsetDateTime finalizedAt;

    @Column(updatable = false)
    private UUID idempotencyKey;

    // ── L2 maker-checker ──────────────────────────────────────────────────

    @Setter @Column(nullable = false)
    private String approvalStatus;

    @Setter @Column
    private UUID approvedBy;

    @Setter @Column
    private OffsetDateTime approvedAt;

    @Setter @Column
    private String rejectionReason;

    protected Invoice() {}

    public Invoice(String invoiceNumber, String invoiceType, UUID patientId,
                   UUID opVisitId, UUID ipAdmissionId, UUID idempotencyKey, UUID createdBy) {
        this.invoiceNumber         = invoiceNumber;
        this.invoiceType           = invoiceType;
        this.patientId             = patientId;
        this.opVisitId             = opVisitId;
        this.ipAdmissionId         = ipAdmissionId;
        this.invoiceDate           = LocalDate.now();
        this.subtotal              = BigDecimal.ZERO;
        this.totalLineDiscount     = BigDecimal.ZERO;
        this.billDiscountAmount    = BigDecimal.ZERO;
        this.totalTax              = BigDecimal.ZERO;
        this.totalAmount           = BigDecimal.ZERO;
        this.amountPaid            = BigDecimal.ZERO;
        this.insuranceCoveredAmount = BigDecimal.ZERO;
        this.patientCopayAmount    = BigDecimal.ZERO;
        this.paymentStatus         = "draft";
        this.approvalStatus        = "pending_approval";
        this.idempotencyKey        = idempotencyKey;
        setCreatedBy(createdBy);
    }

    public void finalize(UUID actorId) {
        this.paymentStatus = "finalized";
        this.finalizedAt   = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void approve(UUID approver, UUID actorId) {
        this.approvalStatus = "approved";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void reject(UUID approver, String reason, UUID actorId) {
        this.approvalStatus  = "rejected";
        this.approvedBy      = approver;
        this.approvedAt      = OffsetDateTime.now();
        this.rejectionReason = reason;
        setUpdatedBy(actorId);
    }

    public void recordPayment(BigDecimal amount, UUID actorId) {
        this.amountPaid = this.amountPaid.add(amount);
        // balance is GENERATED — recomputed by DB
        this.paymentStatus = this.amountPaid.compareTo(this.totalAmount) >= 0 ? "paid" : "partially_paid";
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.paymentStatus = "cancelled";
        setUpdatedBy(actorId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Invoice i)) return false;
        return invoiceNumber != null && invoiceNumber.equals(i.invoiceNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(invoiceNumber); }
}
