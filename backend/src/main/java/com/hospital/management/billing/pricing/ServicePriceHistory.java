package com.hospital.management.billing.pricing;

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
import java.util.Objects;
import java.util.UUID;

/**
 * Immutable price audit trail. Written exclusively by fn_services_price_history()
 * DB trigger — never directly by application code.
 *
 * One open row per service (effectiveTo IS NULL = current active price).
 * UPDATE is restricted by DB trigger to allow only setting effectiveTo on an open row.
 * DELETE is permanently blocked by DB trigger.
 *
 * effective period: [effectiveFrom, effectiveTo) — effectiveTo IS NULL means "to now".
 */
@Entity
@Table(name = "service_price_history")
@Getter
public class ServicePriceHistory extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID serviceId;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal price;

    @Column(nullable = false, updatable = false)
    private LocalDate effectiveFrom;

    /** NULL = current/active price. Set by trigger when a newer price replaces this row. */
    @Setter @Column
    private LocalDate effectiveTo;

    @Column(updatable = false)
    private UUID changedBy;

    @Column(updatable = false)
    private String reason;

    protected ServicePriceHistory() {}

    public boolean isOpen() { return effectiveTo == null; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ServicePriceHistory h)) return false;
        return Objects.equals(serviceId, h.serviceId)
            && Objects.equals(effectiveFrom, h.effectiveFrom);
    }

    @Override
    public int hashCode() { return Objects.hash(serviceId, effectiveFrom); }
}
