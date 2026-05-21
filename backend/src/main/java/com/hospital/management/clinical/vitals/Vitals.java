package com.hospital.management.clinical.vitals;

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
 * Vital signs recorded per visit. bmi is GENERATED from weight_kg and height_cm — never written by app.
 * All measurement columns are nullable — only the values that were actually taken are set.
 */
@Entity
@Table(name = "vitals")
@Getter
public class Vitals extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    /** FK → op_visits(id) RESTRICT. NULL if recorded outside a formal visit context. */
    @Column(updatable = false)
    private UUID opVisitId;

    @Setter @Column
    private Integer bpSystolic;

    @Setter @Column
    private Integer bpDiastolic;

    @Setter @Column
    private Integer pulseRate;

    @Setter @Column
    private Integer spo2;

    @Setter @Column(precision = 4, scale = 1)
    private BigDecimal temperature;

    @Setter @Column
    private Integer respiratoryRate;

    @Setter @Column(precision = 5, scale = 2)
    private BigDecimal weightKg;

    @Setter @Column(precision = 5, scale = 2)
    private BigDecimal heightCm;

    /** GENERATED ALWAYS AS (weight_kg / NULLIF((height_cm/100)^2, 0)) STORED — read-only from DB. */
    @Column(precision = 5, scale = 1, insertable = false, updatable = false)
    private BigDecimal bmi;

    @Setter @Column
    private Integer bloodSugarMgDl;

    @Setter @Column
    private Integer painScore;

    @Setter @Column
    private String notes;

    protected Vitals() {}

    public Vitals(UUID patientId, UUID opVisitId, UUID createdBy) {
        this.patientId = patientId;
        this.opVisitId = opVisitId;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Vitals v)) return false;
        return Objects.equals(id, v.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
