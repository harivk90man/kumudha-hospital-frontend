package com.hospital.management.pharmacy.returns;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Pharmacy return transaction header. return_type: full | partial
 * totalReturnAmount is computed from pharmacy_return_items by the service layer.
 * cashSessionId FK added in payments module.
 */
@Entity
@Table(name = "pharmacy_returns")
@Getter
public class PharmacyReturn extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String returnNumber;

    @Column(nullable = false, updatable = false)
    private UUID originalSaleId;

    @Column(updatable = false)
    private UUID patientId;

    @Setter @Column
    private String customerName;

    @Setter @Column
    private String customerMobile;

    @Column(nullable = false, updatable = false)
    private String returnType;

    @Column(nullable = false, updatable = false)
    private String returnReason;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalReturnAmount;

    /** FK → cash_sessions(id) RESTRICT — constraint added in payments module migration. */
    @Setter @Column
    private UUID cashSessionId;

    @Column(nullable = false, updatable = false)
    private UUID processedBy;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime processedAt;

    protected PharmacyReturn() {}

    public PharmacyReturn(String returnNumber, UUID originalSaleId, UUID patientId,
                          String returnType, String returnReason,
                          UUID processedBy, UUID createdBy) {
        this.returnNumber       = returnNumber;
        this.originalSaleId     = originalSaleId;
        this.patientId          = patientId;
        this.returnType         = returnType;
        this.returnReason       = returnReason;
        this.totalReturnAmount  = BigDecimal.ZERO;
        this.processedBy        = processedBy;
        this.processedAt        = OffsetDateTime.now();
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PharmacyReturn r)) return false;
        return returnNumber != null && returnNumber.equals(r.returnNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(returnNumber); }
}
