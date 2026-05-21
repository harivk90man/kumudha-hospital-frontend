package com.hospital.management.lab.catalogue;

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
 * Lab test catalogue entry.
 * result_type drives how lab technicians enter results (numeric, positive/negative, etc.).
 * reference ranges are gender-aware: ref_min/max_male, ref_min/max_female.
 * critical_low/critical_high trigger the auto-flag trigger and alert workflow.
 * serviceId FK to services(id) added in pricing module migration.
 */
@Entity
@Table(name = "lab_tests")
@Getter
public class LabTest extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String testCode;

    @Setter @Column(nullable = false)
    private String testName;

    @Setter @Column(nullable = false)
    private String category;

    @Setter @Column(nullable = false)
    private String sampleType;

    @Setter @Column(precision = 4, scale = 1)
    private BigDecimal sampleVolumeMl;

    /** FK → departments(id) RESTRICT. NULL = hospital-wide availability. */
    @Setter @Column
    private UUID departmentId;

    /** FK → services(id) RESTRICT — constraint added in pricing module migration. */
    @Column(nullable = false)
    private UUID serviceId;

    @Setter @Column
    private String unit;

    @Setter @Column(nullable = false)
    private String resultType;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal refMinMale;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal refMaxMale;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal refMinFemale;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal refMaxFemale;

    @Setter @Column
    private String referenceDescription;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal criticalLow;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal criticalHigh;

    @Setter @Column(precision = 10, scale = 2)
    private BigDecimal defaultPrice;

    @Setter @Column
    private Integer tatHours;

    @Setter @Column(nullable = false)
    private boolean requiresFasting;

    protected LabTest() {}

    public LabTest(String testCode, String testName, String category,
                   String sampleType, String resultType, UUID serviceId, UUID createdBy) {
        this.testCode       = testCode;
        this.testName       = testName;
        this.category       = category;
        this.sampleType     = sampleType;
        this.resultType     = resultType;
        this.serviceId      = serviceId;
        this.requiresFasting = false;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabTest t)) return false;
        return testCode != null && testCode.equals(t.testCode);
    }

    @Override
    public int hashCode() { return Objects.hash(testCode); }
}
