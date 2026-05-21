package com.hospital.management.lab.sample;

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
 * Physical specimen collected for a lab order.
 * status: collected → received → rejected | processing → processed → disposed
 * replacesSampleId self-FK links a recollected sample back to the rejected original.
 * rejectionReason is mandatory when status = 'rejected'.
 */
@Entity
@Table(name = "lab_samples")
@Getter
public class LabSample extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String sampleBarcode;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(nullable = false, updatable = false)
    private UUID labOrderId;

    @Column(nullable = false, updatable = false)
    private String sampleType;

    @Setter @Column(nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private UUID collectedBy;

    @Setter @Column
    private OffsetDateTime receivedAt;

    @Setter @Column
    private OffsetDateTime rejectedAt;

    @Setter @Column
    private UUID rejectedBy;

    @Setter @Column
    private String rejectionReason;

    @Setter @Column
    private OffsetDateTime disposedAt;

    /** Self-FK: links this sample to the rejected original it replaces. */
    @Column(updatable = false)
    private UUID replacesSampleId;

    @Setter @Column
    private String notes;

    protected LabSample() {}

    public LabSample(String sampleBarcode, UUID patientId, UUID labOrderId,
                     String sampleType, UUID collectedBy, UUID replacesSampleId, UUID createdBy) {
        this.sampleBarcode    = sampleBarcode;
        this.patientId        = patientId;
        this.labOrderId       = labOrderId;
        this.sampleType       = sampleType;
        this.status           = "collected";
        this.collectedBy      = collectedBy;
        this.replacesSampleId = replacesSampleId;
        setCreatedBy(createdBy);
    }

    public void receive(UUID actorId) {
        this.status     = "received";
        this.receivedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void reject(UUID actorId, UUID rejectorId, String reason) {
        this.status          = "rejected";
        this.rejectedAt      = OffsetDateTime.now();
        this.rejectedBy      = rejectorId;
        this.rejectionReason = reason;
        setUpdatedBy(actorId);
    }

    public void markProcessing(UUID actorId) { this.status = "processing"; setUpdatedBy(actorId); }
    public void markProcessed(UUID actorId)  { this.status = "processed";  setUpdatedBy(actorId); }
    public void dispose(UUID actorId)        { this.status = "disposed"; this.disposedAt = OffsetDateTime.now(); setUpdatedBy(actorId); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabSample s)) return false;
        return sampleBarcode != null && sampleBarcode.equals(s.sampleBarcode);
    }

    @Override
    public int hashCode() { return Objects.hash(sampleBarcode); }
}
