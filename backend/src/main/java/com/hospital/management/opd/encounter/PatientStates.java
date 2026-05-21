package com.hospital.management.opd.encounter;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Append log of every station a patient passes through after payment.
 * One row per station entry per visit. leftAt = NULL means the patient
 * is currently at that station.
 *
 * Transition pattern (two writes, one transaction):
 *   1. UPDATE current active row — set leftAt = now()
 *   2. INSERT new row for next station with leftAt = NULL
 *
 * DB partial unique index uq_patient_states_one_active on (op_visit_id)
 * WHERE left_at IS NULL enforces at most one active row per visit.
 * No status column — leftAt IS NULL is the status.
 */
@Entity
@Table(name = "patient_states")
@Getter
public class PatientStates extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(updatable = false, nullable = false)
    private UUID patientId;

    @Column(updatable = false, nullable = false)
    private UUID opVisitId;

    @Column(updatable = false, nullable = false)
    private UUID stationId;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime enteredAt;

    /** NULL = currently at this station. Set when patient moves to next station. */
    @Column
    private OffsetDateTime leftAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String metadata;

    protected PatientStates() {}

    public PatientStates(UUID patientId, UUID opVisitId, UUID stationId, UUID createdBy) {
        this.patientId = patientId;
        this.opVisitId = opVisitId;
        this.stationId = stationId;
        this.enteredAt = OffsetDateTime.now();
        this.leftAt    = null;
        this.metadata  = "{}";
        setCreatedBy(createdBy);
    }

    public PatientStates(UUID patientId, UUID opVisitId, UUID stationId,
                         String metadata, UUID createdBy) {
        this(patientId, opVisitId, stationId, createdBy);
        this.metadata = metadata != null ? metadata : "{}";
    }

    /** Called when the patient moves to the next station. Sets leftAt = now(). */
    public void close(UUID actorId) {
        this.leftAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public boolean isActive() { return leftAt == null; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientStates ps)) return false;
        return Objects.equals(id, ps.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
