package com.hospital.management.lab.order;

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
 * Lab order header. orderNumber is app-generated (e.g. LB-2026-00123).
 * status: ordered → paid → sample_collection → sample_collected → in_progress
 *         → partially_reported → reported → released | cancelled
 * invoiceId FK to invoices(id) added in billing module migration.
 */
@Entity
@Table(name = "lab_orders")
@Getter
public class LabOrder extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String orderNumber;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    /** FK → op_visits(id) RESTRICT. NULL if ordered outside a formal visit. */
    @Column(updatable = false)
    private UUID opVisitId;

    /** FK → consultations(id) RESTRICT. NULL for standalone lab orders. */
    @Column(updatable = false)
    private UUID consultationId;

    @Column(nullable = false)
    private UUID doctorId;

    @Setter @Column(nullable = false)
    private String priority;

    @Setter @Column(nullable = false)
    private String status;

    /** FK → invoices(id) RESTRICT — constraint added in billing module migration. */
    @Setter @Column
    private UUID invoiceId;

    @Setter @Column
    private OffsetDateTime completedAt;

    protected LabOrder() {}

    public LabOrder(String orderNumber, UUID patientId, UUID opVisitId,
                    UUID consultationId, UUID doctorId, String priority, UUID createdBy) {
        this.orderNumber    = orderNumber;
        this.patientId      = patientId;
        this.opVisitId      = opVisitId;
        this.consultationId = consultationId;
        this.doctorId       = doctorId;
        this.priority       = priority;
        this.status         = "ordered";
        setCreatedBy(createdBy);
    }

    public void markPaid(UUID actorId)             { this.status = "paid";              setUpdatedBy(actorId); }
    public void markSampleCollection(UUID actorId)  { this.status = "sample_collection"; setUpdatedBy(actorId); }
    public void markSampleCollected(UUID actorId)   { this.status = "sample_collected";  setUpdatedBy(actorId); }
    public void markInProgress(UUID actorId)        { this.status = "in_progress";       setUpdatedBy(actorId); }
    public void markReported(UUID actorId)          { this.status = "reported";          setUpdatedBy(actorId); }
    public void release(UUID actorId)               { this.status = "released"; this.completedAt = OffsetDateTime.now(); setUpdatedBy(actorId); }
    public void cancel(UUID actorId)                { this.status = "cancelled";         setUpdatedBy(actorId); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabOrder l)) return false;
        return orderNumber != null && orderNumber.equals(l.orderNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(orderNumber); }
}
