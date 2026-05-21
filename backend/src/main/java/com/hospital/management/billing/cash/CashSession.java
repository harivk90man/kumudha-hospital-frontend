package com.hospital.management.billing.cash;

import com.fasterxml.jackson.databind.JsonNode;
import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Cashier shift record. status: open → closed → reopened → closed → locked
 * variance = counted_cash - expected_cash (GENERATED — never written by app).
 * denomination_breakdown jsonb records coin/note counts at closure.
 * Every payment in the system must belong to an open cash session.
 */
@Entity
@Table(name = "cash_sessions")
@Getter
public class CashSession extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID counterId;

    @Column(nullable = false, unique = true, updatable = false)
    private String sessionNumber;

    @Column(nullable = false, updatable = false)
    private String sessionLabel;

    @Column(nullable = false, updatable = false)
    private LocalDate businessDate;

    @Column(nullable = false, updatable = false)
    private UUID openedBy;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime openedAt;

    @Setter @Column
    private UUID closedBy;

    @Setter @Column
    private OffsetDateTime closedAt;

    @Setter @Column(nullable = false)
    private String status;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal openingFloat;

    @Setter @Column(precision = 14, scale = 2)
    private BigDecimal expectedCash;

    @Setter @Column(precision = 14, scale = 2)
    private BigDecimal countedCash;

    /** GENERATED ALWAYS AS (counted_cash - expected_cash) STORED — never written by app. */
    @Column(precision = 14, scale = 2, insertable = false, updatable = false)
    private BigDecimal variance;

    @Setter @Column
    private String varianceReason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Setter @Column(columnDefinition = "jsonb")
    private JsonNode denominationBreakdown;

    @Setter @Column
    private String closureNotes;

    protected CashSession() {}

    public CashSession(UUID counterId, String sessionNumber, String sessionLabel,
                       LocalDate businessDate, UUID openedBy,
                       BigDecimal openingFloat, UUID createdBy) {
        this.counterId     = counterId;
        this.sessionNumber = sessionNumber;
        this.sessionLabel  = sessionLabel;
        this.businessDate  = businessDate;
        this.openedBy      = openedBy;
        this.openedAt      = OffsetDateTime.now();
        this.status        = "open";
        this.openingFloat  = openingFloat;
        setCreatedBy(createdBy);
    }

    public void close(UUID closerBy, BigDecimal expected, BigDecimal counted,
                      JsonNode denomBreakdown, String notes, UUID actorId) {
        this.status                = "closed";
        this.closedBy              = closerBy;
        this.closedAt              = OffsetDateTime.now();
        this.expectedCash          = expected;
        this.countedCash           = counted;
        this.denominationBreakdown = denomBreakdown;
        this.closureNotes          = notes;
        setUpdatedBy(actorId);
    }

    public void lock(UUID actorId) {
        this.status = "locked";
        setUpdatedBy(actorId);
    }

    public boolean isOpen() { return "open".equals(status) || "reopened".equals(status); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CashSession s)) return false;
        return sessionNumber != null && sessionNumber.equals(s.sessionNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(sessionNumber); }
}
