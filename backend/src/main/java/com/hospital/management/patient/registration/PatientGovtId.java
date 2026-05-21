package com.hospital.management.patient.registration;

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
 * Government-issued identity documents for a patient.
 * One active row per id_type per patient (partial unique index).
 * Aadhaar: store only masked form (last 4 digits) — the app enforces the mask.
 * id_type: aadhaar | pan | voter_id | passport | driving_licence | ration_card | other
 */
@Entity
@Table(name = "patient_govt_ids")
@Getter
public class PatientGovtId extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID patientId;

    @Column(nullable = false)
    private String idType;

    @Setter @Column(nullable = false)
    private String idNumber;

    protected PatientGovtId() {}

    public PatientGovtId(UUID patientId, String idType, String idNumber, UUID createdBy) {
        this.patientId = patientId;
        this.idType    = idType;
        this.idNumber  = idNumber;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientGovtId g)) return false;
        return Objects.equals(patientId, g.patientId) && Objects.equals(idType, g.idType);
    }

    @Override
    public int hashCode() { return Objects.hash(patientId, idType); }
}
