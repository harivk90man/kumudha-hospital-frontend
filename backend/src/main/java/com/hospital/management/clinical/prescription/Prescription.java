package com.hospital.management.clinical.prescription;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Pharmacy fulfilment header — one per consultation.
 * status lifecycle: draft → active → partially_dispensed → dispensed | cancelled
 * Pharmacy workqueue shows active and partially_dispensed prescriptions.
 */
@Entity
@Table(name = "prescriptions")
@Getter
public class Prescription extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID consultationId;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(nullable = false, updatable = false)
    private UUID doctorId;

    @Setter @Column(nullable = false)
    private String status;

    @Column
    private OffsetDateTime lockedAt;

    protected Prescription() {}

    public Prescription(UUID consultationId, UUID patientId, UUID doctorId, UUID createdBy) {
        this.consultationId = consultationId;
        this.patientId      = patientId;
        this.doctorId       = doctorId;
        this.status         = "draft";
        setCreatedBy(createdBy);
    }

    /** Doctor signs the prescription — makes it visible to pharmacy. */
    public void activate(UUID actorId) {
        this.status   = "active";
        this.lockedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void markPartiallyDispensed(UUID actorId) {
        this.status = "partially_dispensed";
        setUpdatedBy(actorId);
    }

    public void markFullyDispensed(UUID actorId) {
        this.status = "dispensed";
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.status = "cancelled";
        setUpdatedBy(actorId);
    }

    public boolean isDispensable() {
        return "active".equals(status) || "partially_dispensed".equals(status);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Prescription p)) return false;
        return Objects.equals(consultationId, p.consultationId);
    }

    @Override
    public int hashCode() { return Objects.hash(consultationId); }
}
