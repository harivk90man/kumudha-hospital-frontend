package com.hospital.management.billing.payment;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Payment transaction. direction=in for receipts, direction=out for refunds.
 * Every payment belongs to an open cash session for daily reconciliation.
 *
 * Exactly one of patientId (registered) or walkInName (unregistered) must be set.
 * pharmacyReturnId is only valid when paymentDirection = 'out'.
 *
 * payment_mode: cash | card | upi | cheque | net_banking | other
 */
@Entity
@Table(name = "payments")
@Getter
public class Payment extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(updatable = false)
    private UUID patientId;

    @Column(updatable = false)
    private String walkInName;

    @Setter @Column
    private String walkInMobile;

    @Column(nullable = false, updatable = false)
    private String paymentDirection;

    @Column(nullable = false, updatable = false)
    private String paymentMode;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Setter @Column
    private String transactionRef;

    @Column(nullable = false, updatable = false)
    private UUID receivedBy;

    @Column(nullable = false, updatable = false)
    private UUID cashSessionId;

    @Column(updatable = false)
    private UUID idempotencyKey;

    @Column(updatable = false)
    private UUID pharmacyReturnId;

    @Setter @Column
    private String notes;

    protected Payment() {}

    public Payment(UUID patientId, String walkInName, String paymentDirection,
                   String paymentMode, BigDecimal amount, UUID receivedBy,
                   UUID cashSessionId, UUID idempotencyKey, UUID pharmacyReturnId,
                   UUID createdBy) {
        this.patientId        = patientId;
        this.walkInName       = walkInName;
        this.paymentDirection = paymentDirection;
        this.paymentMode      = paymentMode;
        this.amount           = amount;
        this.receivedBy       = receivedBy;
        this.cashSessionId    = cashSessionId;
        this.idempotencyKey   = idempotencyKey;
        this.pharmacyReturnId = pharmacyReturnId;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Payment p)) return false;
        return Objects.equals(id, p.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
