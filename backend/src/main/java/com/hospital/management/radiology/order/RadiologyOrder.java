package com.hospital.management.radiology.order;

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
 * Radiology order header. orderNumber is app-generated (e.g. RAD-2026-00101).
 * status: ordered → awaiting_payment → paid → imaging_pending → imaging_in_progress
 *         → imaging_completed → reporting_pending → reported → released | cancelled
 * At most one of opVisitId or ipAdmissionId may be non-NULL (enforced by DB CHECK).
 * invoiceId FK added in billing module; ipAdmissionId FK added in IP module.
 */
@Entity
@Table(name = "radiology_orders")
@Getter
public class RadiologyOrder extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String orderNumber;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(updatable = false)
    private UUID opVisitId;

    /** FK → ip_admissions(id) RESTRICT — constraint added in IP module migration. */
    @Column(updatable = false)
    private UUID ipAdmissionId;

    @Column(updatable = false)
    private UUID consultationId;

    @Column(nullable = false)
    private UUID doctorId;

    @Column(nullable = false, updatable = false)
    private UUID radiologyProcedureId;

    @Setter @Column
    private String clinicalQuestion;

    @Setter @Column(nullable = false)
    private String priority;

    /** FK → invoices(id) RESTRICT — constraint added in billing module migration. */
    @Setter @Column
    private UUID invoiceId;

    @Setter @Column(nullable = false)
    private String status;

    @Setter @Column
    private OffsetDateTime imagingCompletedAt;

    @Setter @Column
    private OffsetDateTime releasedAt;

    protected RadiologyOrder() {}

    public RadiologyOrder(String orderNumber, UUID patientId, UUID opVisitId,
                          UUID ipAdmissionId, UUID consultationId, UUID doctorId,
                          UUID radiologyProcedureId, String priority, UUID createdBy) {
        this.orderNumber          = orderNumber;
        this.patientId            = patientId;
        this.opVisitId            = opVisitId;
        this.ipAdmissionId        = ipAdmissionId;
        this.consultationId       = consultationId;
        this.doctorId             = doctorId;
        this.radiologyProcedureId = radiologyProcedureId;
        this.priority             = priority;
        this.status               = "ordered";
        setCreatedBy(createdBy);
    }

    public void markImagingComplete(UUID actorId) {
        this.status              = "imaging_completed";
        this.imagingCompletedAt  = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void release(UUID actorId) {
        this.status     = "released";
        this.releasedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.status = "cancelled";
        setUpdatedBy(actorId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RadiologyOrder r)) return false;
        return orderNumber != null && orderNumber.equals(r.orderNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(orderNumber); }
}
