package com.hospital.management.clinical.recommendation;

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
 * Doctor-ordered follow-on action from a consultation.
 * recommendation_type: follow_up | lab | radiology | specialist_referral | physio | surgery | admission
 * priority: routine | urgent | stat
 * status: open | scheduled | completed | cancelled | declined
 *
 * At most one of (followUpAppointmentId, labOrderId, radiologyOrderId) may be non-NULL.
 * labOrderId and radiologyOrderId FKs are added in their respective module migrations.
 */
@Entity
@Table(name = "doctor_recommendations")
@Getter
public class DoctorRecommendation extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID consultationId;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(nullable = false, updatable = false)
    private String recommendationType;

    /** FK → appointments(id) RESTRICT. Set when recommendation_type = 'follow_up'. */
    @Setter @Column
    private UUID followUpAppointmentId;

    /** FK → lab_orders(id) RESTRICT — constraint added in lab module migration. */
    @Setter @Column
    private UUID labOrderId;

    /** FK → radiology_orders(id) RESTRICT — constraint added in radiology module migration. */
    @Setter @Column
    private UUID radiologyOrderId;

    @Setter @Column
    private String referralNotes;

    @Setter @Column
    private String notes;

    @Column(nullable = false)
    private String priority;

    @Setter @Column(nullable = false)
    private String status;

    protected DoctorRecommendation() {}

    public DoctorRecommendation(UUID consultationId, UUID patientId,
                                String recommendationType, String priority, UUID createdBy) {
        this.consultationId      = consultationId;
        this.patientId           = patientId;
        this.recommendationType  = recommendationType;
        this.priority            = priority;
        this.status              = "open";
        setCreatedBy(createdBy);
    }

    public void schedule(UUID actorId) {
        this.status = "scheduled";
        setUpdatedBy(actorId);
    }

    public void complete(UUID actorId) {
        this.status = "completed";
        setUpdatedBy(actorId);
    }

    public void cancel(UUID actorId) {
        this.status = "cancelled";
        setUpdatedBy(actorId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DoctorRecommendation r)) return false;
        return Objects.equals(id, r.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
