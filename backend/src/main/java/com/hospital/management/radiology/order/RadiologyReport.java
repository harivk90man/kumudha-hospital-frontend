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
 * Radiology report. L2 maker-checker:
 *   reportedByRadiologistId (maker) dictates → approvedBy (checker, different user) releases.
 *
 * release_status: pending_verification → verified → released | rejected | amended
 * approval_status: pending_approval → approved | rejected
 *
 * A released report is visible to the requesting doctor and patient.
 * Amendments: create a new report row with amendedFromReportId pointing to the original;
 * set the original's releaseStatus to 'amended' in the same transaction.
 *
 * Separation of duties enforced by DB CHECK: reportedByRadiologistId ≠ approvedBy.
 * Single-radiologist deployments can disable this via system_config radiology.allow_self_approval.
 */
@Entity
@Table(name = "radiology_reports")
@Getter
public class RadiologyReport extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID radiologyOrderId;

    @Setter @Column
    private String findings;

    @Setter @Column
    private String impression;

    @Setter @Column
    private String recommendation;

    @Column(nullable = false, updatable = false)
    private UUID reportedByRadiologistId;

    @Setter @Column
    private OffsetDateTime dictatedAt;

    @Setter @Column(nullable = false)
    private String releaseStatus;

    @Setter @Column
    private byte[] reportData;

    /** Self-FK: links a corrected report back to the report it replaces. */
    @Column(updatable = false)
    private UUID amendedFromReportId;

    @Setter @Column
    private String amendmentReason;

    // ── L2 maker-checker ──────────────────────────────────────────────────

    @Setter @Column(nullable = false)
    private String approvalStatus;

    /** FK → users(id) RESTRICT. Must differ from reportedByRadiologistId. */
    @Setter @Column
    private UUID approvedBy;

    @Setter @Column
    private OffsetDateTime approvedAt;

    @Setter @Column
    private String rejectionReason;

    protected RadiologyReport() {}

    public RadiologyReport(UUID radiologyOrderId, UUID reportedByRadiologistId,
                           UUID amendedFromReportId, UUID createdBy) {
        this.radiologyOrderId        = radiologyOrderId;
        this.reportedByRadiologistId = reportedByRadiologistId;
        this.releaseStatus           = "pending_verification";
        this.approvalStatus          = "pending_approval";
        this.amendedFromReportId     = amendedFromReportId;
        setCreatedBy(createdBy);
    }

    public void approve(UUID approver, UUID actorId) {
        this.approvalStatus = "approved";
        this.releaseStatus  = "released";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void reject(UUID approver, String reason, UUID actorId) {
        this.approvalStatus   = "rejected";
        this.releaseStatus    = "rejected";
        this.approvedBy       = approver;
        this.approvedAt       = OffsetDateTime.now();
        this.rejectionReason  = reason;
        setUpdatedBy(actorId);
    }

    public void markAmended(UUID actorId) {
        this.releaseStatus = "amended";
        setUpdatedBy(actorId);
    }

    public boolean isReleased() { return "released".equals(releaseStatus); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RadiologyReport r)) return false;
        return Objects.equals(radiologyOrderId, r.radiologyOrderId)
            && amendedFromReportId == null && r.amendedFromReportId == null;
    }

    @Override
    public int hashCode() { return Objects.hash(radiologyOrderId, amendedFromReportId); }
}
