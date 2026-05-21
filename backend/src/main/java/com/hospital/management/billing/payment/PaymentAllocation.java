package com.hospital.management.billing.payment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Immutable allocation of a payment to a billing target.
 * UPDATE and DELETE blocked by DB trigger — corrections insert a reversal row.
 *
 * allocation_type drives which FK column is set (at most one):
 *   invoice       → invoiceId
 *   pharmacy_sale → pharmacySaleId
 *   ip_advance    → ipAdmissionId (FK added in IP module)
 *   refund        → no FK (links to the original payment via service layer)
 *   on_account    → no FK (funds held for future allocation)
 */
@Entity
@Table(name = "payment_allocations")
@Getter
public class PaymentAllocation {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID paymentId;

    @Column(nullable = false, updatable = false)
    private String allocationType;

    @Column(updatable = false)
    private UUID invoiceId;

    @Column(updatable = false)
    private UUID pharmacySaleId;

    /** FK → ip_admissions(id) RESTRICT — constraint added in IP module migration. */
    @Column(updatable = false)
    private UUID ipAdmissionId;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(updatable = false)
    private String notes;

    // ── Append-only audit (no soft-delete, no updates) ────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    private UUID updatedBy;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    @Version @Column(nullable = false)
    private int version;

    @PrePersist protected void onInsert() { createdAt = OffsetDateTime.now(); updatedAt = createdAt; }
    public void setCreatedBy(UUID v) { this.createdBy = v; }

    protected PaymentAllocation() {}

    public PaymentAllocation(UUID paymentId, String allocationType, UUID invoiceId,
                             UUID pharmacySaleId, UUID ipAdmissionId,
                             BigDecimal amount, String notes, UUID createdBy) {
        this.paymentId      = paymentId;
        this.allocationType = allocationType;
        this.invoiceId      = invoiceId;
        this.pharmacySaleId = pharmacySaleId;
        this.ipAdmissionId  = ipAdmissionId;
        this.amount         = amount;
        this.notes          = notes;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PaymentAllocation a)) return false;
        return Objects.equals(id, a.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
