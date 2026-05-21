package com.hospital.management.pharmacy.dispensing;

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
 * Pharmacy sale header. status: draft → billed → dispensed | partially_dispensed | cancelled | returned
 * Walk-in patients without a patient record use customerName/customerMobile instead of patientId.
 * invoiceId FK added in billing module; cashSessionId FK added in payments module.
 * idempotencyKey prevents duplicate sale creation on network retries.
 */
@Entity
@Table(name = "pharmacy_sales")
@Getter
public class PharmacySale extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String saleNumber;

    @Column(updatable = false)
    private UUID patientId;

    @Column(nullable = false, updatable = false)
    private String saleType;

    @Column(updatable = false)
    private UUID prescriptionId;

    @Setter @Column
    private String externalPrescriptionRef;

    @Setter @Column
    private String customerName;

    @Setter @Column
    private String customerMobile;

    @Setter @Column
    private Integer customerAge;

    /** FK → invoices(id) RESTRICT — constraint added in billing module migration. */
    @Setter @Column
    private UUID invoiceId;

    /** FK → cash_sessions(id) RESTRICT — constraint added in payments module migration. */
    @Setter @Column
    private UUID cashSessionId;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotal;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalTax;

    @Setter @Column(precision = 4, scale = 2)
    private BigDecimal billDiscountPct;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal billDiscountAmount;

    @Setter @Column
    private UUID billDiscountApprovedBy;

    @Setter @Column
    private String billDiscountReason;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal netAmount;

    @Setter @Column(nullable = false)
    private String status;

    @Column(unique = true, updatable = false)
    private UUID idempotencyKey;

    protected PharmacySale() {}

    public PharmacySale(String saleNumber, UUID patientId, String saleType,
                        UUID prescriptionId, UUID idempotencyKey, UUID createdBy) {
        this.saleNumber      = saleNumber;
        this.patientId       = patientId;
        this.saleType        = saleType;
        this.prescriptionId  = prescriptionId;
        this.idempotencyKey  = idempotencyKey;
        this.status          = "draft";
        this.subtotal        = BigDecimal.ZERO;
        this.totalTax        = BigDecimal.ZERO;
        this.billDiscountAmount = BigDecimal.ZERO;
        this.netAmount       = BigDecimal.ZERO;
        setCreatedBy(createdBy);
    }

    public void bill(UUID actorId)              { this.status = "billed";             setUpdatedBy(actorId); }
    public void dispense(UUID actorId)           { this.status = "dispensed";           setUpdatedBy(actorId); }
    public void partiallyDispense(UUID actorId)  { this.status = "partially_dispensed"; setUpdatedBy(actorId); }
    public void cancel(UUID actorId)             { this.status = "cancelled";           setUpdatedBy(actorId); }
    public void markReturned(UUID actorId)       { this.status = "returned";            setUpdatedBy(actorId); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PharmacySale s)) return false;
        return saleNumber != null && saleNumber.equals(s.saleNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(saleNumber); }
}
