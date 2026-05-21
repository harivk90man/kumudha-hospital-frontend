package com.hospital.management.opd.appointment;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Queue token issued to a patient for a specific service. Exactly one of the five
 * parent FK columns is non-NULL (enforced by DB CHECK constraints).
 *
 * service_type → parent FK:
 *   consultation → op_visit_id
 *   lab          → lab_order_id          (FK added in lab module migration)
 *   radiology    → radiology_order_id    (FK added in radiology module migration)
 *   pharmacy     → pharmacy_sale_id      (FK added in pharmacy module migration)
 *   billing      → invoice_id            (FK added in billing module migration)
 *
 * status: active → called → completed | cancelled | no_show
 */
@Entity
@Table(name = "tokens")
@Getter
public class Token extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String tokenNumber;

    @Column(nullable = false, updatable = false)
    private int tokenSequence;

    @Column(nullable = false, updatable = false)
    private String serviceType;

    /** FK → users(id) SET NULL. Doctor for consultation tokens; NULL for shared queues. */
    @Column(updatable = false)
    private UUID providerId;

    @Column(nullable = false, updatable = false)
    private LocalDate issueDate;

    /** FK → op_visits(id) RESTRICT. Set when service_type = 'consultation'. */
    @Column(updatable = false)
    private UUID opVisitId;

    /** FK → lab_orders(id) RESTRICT — added in lab module migration (V__create_lab_orders). */
    @Column(updatable = false)
    private UUID labOrderId;

    /** FK → radiology_orders(id) RESTRICT — added in radiology module migration. */
    @Column(updatable = false)
    private UUID radiologyOrderId;

    /** FK → pharmacy_sales(id) RESTRICT — added in pharmacy module migration. */
    @Column(updatable = false)
    private UUID pharmacySaleId;

    /** FK → invoices(id) RESTRICT — added in billing module migration. */
    @Column(updatable = false)
    private UUID invoiceId;

    @Setter @Column(nullable = false)
    private String status;

    /** FK → users(id) SET NULL. Staff who issued the token. */
    @Column(updatable = false)
    private UUID issuedBy;

    @Setter @Column
    private OffsetDateTime calledAt;

    @Setter @Column
    private OffsetDateTime completedAt;

    protected Token() {}

    public Token(String tokenNumber, int tokenSequence, String serviceType,
                 UUID providerId, LocalDate issueDate, UUID parentId,
                 UUID issuedBy, UUID createdBy) {
        this.tokenNumber   = tokenNumber;
        this.tokenSequence = tokenSequence;
        this.serviceType   = serviceType;
        this.providerId    = providerId;
        this.issueDate     = issueDate;
        this.status        = "active";
        this.issuedBy      = issuedBy;
        setParentId(serviceType, parentId);
        setCreatedBy(createdBy);
    }

    private void setParentId(String type, UUID parentId) {
        switch (type) {
            case "consultation" -> this.opVisitId       = parentId;
            case "lab"          -> this.labOrderId      = parentId;
            case "radiology"    -> this.radiologyOrderId = parentId;
            case "pharmacy"     -> this.pharmacySaleId  = parentId;
            case "billing"      -> this.invoiceId       = parentId;
            default -> throw new IllegalArgumentException("Unknown service_type: " + type);
        }
    }

    public void call(UUID actorId) {
        this.status   = "called";
        this.calledAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void complete(UUID actorId) {
        this.status      = "completed";
        this.completedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.status = "cancelled";
        setUpdatedBy(actorId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Token t)) return false;
        return Objects.equals(serviceType, t.serviceType)
            && Objects.equals(providerId, t.providerId)
            && Objects.equals(issueDate, t.issueDate)
            && tokenSequence == t.tokenSequence;
    }

    @Override
    public int hashCode() { return Objects.hash(serviceType, providerId, issueDate, tokenSequence); }
}
