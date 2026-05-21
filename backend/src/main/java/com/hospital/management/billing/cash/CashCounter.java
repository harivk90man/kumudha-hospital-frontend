package com.hospital.management.billing.cash;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

/**
 * Physical billing/pharmacy cash counter. Flyway-seeded at deployment.
 * One cash session is open per counter per shift.
 */
@Entity
@Table(name = "cash_counters")
@Getter
public class CashCounter extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String counterCode;

    @Setter @Column(nullable = false)
    private String counterName;

    @Setter @Column
    private String location;

    protected CashCounter() {}

    public CashCounter(String counterCode, String counterName, String location, UUID createdBy) {
        this.counterCode = counterCode;
        this.counterName = counterName;
        this.location    = location;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CashCounter c)) return false;
        return counterCode != null && counterCode.equals(c.counterCode);
    }

    @Override
    public int hashCode() { return Objects.hash(counterCode); }
}
