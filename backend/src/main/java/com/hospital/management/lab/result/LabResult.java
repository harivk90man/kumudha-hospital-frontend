package com.hospital.management.lab.result;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Lab result for one test line. L2 maker-checker:
 *   performedBy (tech) enters → verifiedBy (senior, different user) releases.
 *
 * flag is auto-set by fn_lab_result_autoflag() BEFORE INSERT trigger using
 * gender-aware reference ranges from lab_tests. Override before INSERT if needed.
 *
 * Amendments: a corrected result sets amendedFromResultId → original.
 * The original result's releaseStatus is then set to 'amended' by the service layer.
 */
@Entity
@Table(name = "lab_results")
@Getter
public class LabResult extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID labOrderItemId;

    @Column(nullable = false)
    private String valueRaw;

    @Setter @Column(precision = 12, scale = 4)
    private BigDecimal valueNumeric;

    @Setter @Column
    private String unit;

    /** Auto-set by BEFORE INSERT trigger fn_lab_result_autoflag(). App may override before INSERT. */
    @Setter @Column(nullable = false)
    private String flag;

    @Setter @Column
    private String method;

    @Setter @Column
    private String comments;

    @Column(nullable = false, updatable = false)
    private UUID performedBy;

    /** Raw PDF/image bytes for uploaded reports. NULL when report generated on-the-fly. */
    @Setter @Column
    private byte[] reportData;

    // ── L2 maker-checker ────────────────────────────────────────────────────

    @Setter @Column(nullable = false)
    private String releaseStatus;

    /** FK → users(id) SET NULL. Must differ from performedBy — enforced by DB CHECK. */
    @Setter @Column
    private UUID verifiedBy;

    @Setter @Column
    private OffsetDateTime verifiedAt;

    @Setter @Column
    private String rejectionReason;

    @Column(nullable = false)
    private boolean isOverrideRelease;

    @Setter @Column
    private String overrideReleaseReason;

    /** Self-FK → lab_results(id) RESTRICT. Links amendment to original result. */
    @Column(updatable = false)
    private UUID amendedFromResultId;

    protected LabResult() {}

    public LabResult(UUID labOrderItemId, String valueRaw, BigDecimal valueNumeric,
                     String unit, String flag, UUID performedBy,
                     UUID amendedFromResultId, UUID createdBy) {
        this.labOrderItemId      = labOrderItemId;
        this.valueRaw            = valueRaw;
        this.valueNumeric        = valueNumeric;
        this.unit                = unit;
        this.flag                = flag;
        this.performedBy         = performedBy;
        this.releaseStatus       = "pending_verification";
        this.isOverrideRelease   = false;
        this.amendedFromResultId = amendedFromResultId;
        setCreatedBy(createdBy);
    }

    public void verify(UUID verifier, UUID actorId) {
        this.releaseStatus = "verified";
        this.verifiedBy    = verifier;
        this.verifiedAt    = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public void overrideRelease(UUID verifier, String reason, UUID actorId) {
        this.releaseStatus         = "override_released";
        this.verifiedBy            = verifier;
        this.verifiedAt            = OffsetDateTime.now();
        this.isOverrideRelease     = true;
        this.overrideReleaseReason = reason;
        setUpdatedBy(actorId);
    }

    public void reject(UUID verifier, String reason, UUID actorId) {
        this.releaseStatus   = "rejected";
        this.verifiedBy      = verifier;
        this.verifiedAt      = OffsetDateTime.now();
        this.rejectionReason = reason;
        setUpdatedBy(actorId);
    }

    public void markAmended(UUID actorId) {
        this.releaseStatus = "amended";
        setUpdatedBy(actorId);
    }

    public boolean isCritical() {
        return "critical_low".equals(flag) || "critical_high".equals(flag);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabResult r)) return false;
        return Objects.equals(labOrderItemId, r.labOrderItemId);
    }

    @Override
    public int hashCode() { return Objects.hash(labOrderItemId); }
}
