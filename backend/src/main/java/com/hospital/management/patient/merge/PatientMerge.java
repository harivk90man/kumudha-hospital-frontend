package com.hospital.management.patient.merge;

import com.hospital.management.platform.audit.AuditableEntity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Records a duplicate-patient merge. Primary survives; secondary is soft-deleted.
 * before_state snapshots the secondary patient row for unmerge capability.
 * L2 maker-checker: creator cannot approve their own merge request.
 */
@Entity
@Table(name = "patient_merges")
@Getter
public class PatientMerge extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID primaryPatientId;

    @Column(nullable = false)
    private UUID secondaryPatientId;

    @Setter @Column
    private String mergeReason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode beforeState;

    // ── L2 maker-checker ─────────────────────────────────────────────────────
    @Column(nullable = false)
    private String approvalStatus;

    @Setter @Column
    private UUID approvedBy;

    @Setter @Column
    private OffsetDateTime approvedAt;

    @Setter @Column
    private String rejectionReason;

    protected PatientMerge() {}

    public PatientMerge(UUID primaryPatientId, UUID secondaryPatientId,
                        String mergeReason, JsonNode beforeState, UUID createdBy) {
        this.primaryPatientId   = primaryPatientId;
        this.secondaryPatientId = secondaryPatientId;
        this.mergeReason        = mergeReason;
        this.beforeState        = beforeState;
        this.approvalStatus     = "pending";
        setCreatedBy(createdBy);
    }

    public void approve(UUID approver) {
        this.approvalStatus = "approved";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
    }

    public void reject(UUID approver, String reason) {
        this.approvalStatus   = "rejected";
        this.approvedBy       = approver;
        this.approvedAt       = OffsetDateTime.now();
        this.rejectionReason  = reason;
    }

    public boolean isPending()  { return "pending".equals(approvalStatus); }
    public boolean isApproved() { return "approved".equals(approvalStatus); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientMerge m)) return false;
        return Objects.equals(primaryPatientId, m.primaryPatientId)
            && Objects.equals(secondaryPatientId, m.secondaryPatientId);
    }

    @Override
    public int hashCode() { return Objects.hash(primaryPatientId, secondaryPatientId); }
}
