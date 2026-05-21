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
 * One active allergy per patient, linked to allergies_lookup catalogue.
 * severity: mild | moderate | severe | life_threatening
 * source: patient_reported | doctor_recorded | medical_records
 * Soft-delete to remove — history preserved for audit.
 */
@Entity
@Table(name = "patient_allergies")
@Getter
public class PatientAllergy extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID patientId;

    /** FK → allergies_lookup(id) RESTRICT — raw UUID to avoid cross-package entity import. */
    @Column(nullable = false)
    private UUID allergyId;

    @Setter @Column(nullable = false)
    private String severity;

    @Setter @Column
    private String reaction;

    @Setter @Column
    private LocalDate onsetDate;

    @Column(nullable = false)
    private String source;

    @Setter @Column
    private String notes;

    protected PatientAllergy() {}

    public PatientAllergy(UUID patientId, UUID allergyId, String severity,
                          String source, UUID createdBy) {
        this.patientId = patientId;
        this.allergyId = allergyId;
        this.severity  = severity;
        this.source    = source;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientAllergy a)) return false;
        return Objects.equals(patientId, a.patientId) && Objects.equals(allergyId, a.allergyId);
    }

    @Override
    public int hashCode() { return Objects.hash(patientId, allergyId); }
}
