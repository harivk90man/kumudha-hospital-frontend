package com.hospital.management.billing.payment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Pre-payment gateway idempotency record. One row per attempt across all billable
 * service types: appointment, lab order, radiology order, pharmacy sale.
 * Exactly one source FK column is non-null; enforced by DB CHECK constraint.
 *
 * Lifecycle: initiated → success (paymentId set) | failed | expired
 *
 * Only success rows link to a Payment row via paymentId. Failed and expired
 * attempts carry no financial weight — they exist for the retry mechanism and
 * as an operational audit trail.
 *
 * No soft-delete: attempt rows are permanent records.
 */
@Entity
@Table(name = "payment_attempts")
@Getter
public class PaymentAttempt {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    // ── Source — exactly one non-null (chk_payment_attempts_source) ──────────

    @Column(updatable = false)
    private UUID appointmentId;

    @Column(updatable = false)
    private UUID labOrderId;

    @Column(updatable = false)
    private UUID radiologyOrderId;

    @Column(updatable = false)
    private UUID pharmacySaleId;

    // ── Intent ───────────────────────────────────────────────────────────────

    /** Globally unique. Re-sent to gateway on timeout retry to prevent double-charge. */
    @Column(updatable = false, nullable = false, unique = true)
    private UUID gatewayIdempotencyKey;

    @Column(nullable = false, precision = 14, scale = 2, updatable = false)
    private BigDecimal amount;

    @Column(nullable = false, updatable = false)
    private String paymentMode;

    // ── Outcome ──────────────────────────────────────────────────────────────

    @Column(nullable = false)
    private String status;

    /** Set atomically with the Payment INSERT on success. NULL for all other statuses. */
    @Column
    private UUID paymentId;

    /** UPI txn ID, card RRN, NEFT UTR, etc. Copied to payments.transaction_ref on success. */
    @Column
    private String gatewayRef;

    /** Full gateway response payload. Kept even on failure for dispute resolution. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String gatewayResponse;

    // ── Reduced L1 audit (no soft-delete) ────────────────────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    @Column
    private UUID updatedBy;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(nullable = false)
    private int version;

    @PrePersist
    protected void onInsert() {
        createdAt = OffsetDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    protected PaymentAttempt() {}

    /**
     * Create a new attempt in the 'initiated' state.
     * Exactly one of the source ID parameters must be non-null.
     */
    public PaymentAttempt(UUID appointmentId, UUID labOrderId, UUID radiologyOrderId,
                          UUID pharmacySaleId, UUID gatewayIdempotencyKey,
                          BigDecimal amount, String paymentMode, UUID createdBy) {
        this.appointmentId         = appointmentId;
        this.labOrderId            = labOrderId;
        this.radiologyOrderId      = radiologyOrderId;
        this.pharmacySaleId        = pharmacySaleId;
        this.gatewayIdempotencyKey = gatewayIdempotencyKey;
        this.amount                = amount;
        this.paymentMode           = paymentMode;
        this.status                = "initiated";
        this.createdBy             = createdBy;
    }

    /**
     * Gateway confirmed success. Call inside the same transaction that creates
     * the Payment row so paymentId and status flip atomically.
     */
    public void markSuccess(UUID paymentId, String gatewayRef, String gatewayResponse, UUID actorId) {
        this.status          = "success";
        this.paymentId       = paymentId;
        this.gatewayRef      = gatewayRef;
        this.gatewayResponse = gatewayResponse;
        this.updatedBy       = actorId;
    }

    /**
     * Gateway definitively declined. No Payment row is created.
     * Patient may retry — a new PaymentAttempt row with a new gatewayIdempotencyKey
     * must be created for the next attempt.
     */
    public void markFailed(String gatewayResponse, UUID actorId) {
        this.status          = "failed";
        this.gatewayResponse = gatewayResponse;
        this.updatedBy       = actorId;
    }

    /** Cleanup job marks an unresolved initiated attempt as expired. */
    public void markExpired(UUID actorId) {
        this.status    = "expired";
        this.updatedBy = actorId;
    }

    public boolean isInitiated() { return "initiated".equals(status); }

    public boolean isSuccess()   { return "success".equals(status); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PaymentAttempt a)) return false;
        return gatewayIdempotencyKey != null && gatewayIdempotencyKey.equals(a.gatewayIdempotencyKey);
    }

    @Override
    public int hashCode() { return Objects.hash(gatewayIdempotencyKey); }

    @Override
    public String toString() {
        return "PaymentAttempt[id=" + id + ", status=" + status + ", mode=" + paymentMode + "]";
    }
}
