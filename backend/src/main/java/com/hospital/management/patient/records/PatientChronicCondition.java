package com.hospital.management.patient.records;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * One chronic condition per patient, linked to chronic_conditions_lookup.
 * A resolved condition is marked is_resolved=true — NOT soft-deleted —
 * so medical history remains visible on the patient chart.
 * controlled_status: controlled | partially_controlled | uncontrolled | unknown
 */
@Entity
@Table(name = "patient_chronic_conditions")
@Getter
public class PatientChronicCondition extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID patientId;

    /** FK → chronic_conditions_lookup(id) RESTRICT — raw UUID to avoid cross-package entity import. */
    @Column(nullable = false)
    private UUID conditionId;

    @Setter @Column
    private LocalDate diagnosedDate;

    @Setter @Column
    private String severity;

    @Setter @Column(nullable = false)
    private String controlledStatus;

    @Column(nullable = false)
    private boolean isResolved;

    @Setter @Column
    private LocalDate resolvedDate;

    @Setter @Column
    private String notes;

    protected PatientChronicCondition() {}

    public PatientChronicCondition(UUID patientId, UUID conditionId,
                                   String controlledStatus, UUID createdBy) {
        this.patientId       = patientId;
        this.conditionId     = conditionId;
        this.controlledStatus = controlledStatus;
        this.isResolved      = false;
        setCreatedBy(createdBy);
    }

    public void resolve(LocalDate date) {
        this.isResolved   = true;
        this.resolvedDate = date;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientChronicCondition c)) return false;
        return Objects.equals(patientId, c.patientId) && Objects.equals(conditionId, c.conditionId);
    }

    @Override
    public int hashCode() { return Objects.hash(patientId, conditionId); }
}
