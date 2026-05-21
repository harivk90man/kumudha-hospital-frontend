package com.hospital.management.opd.journey;

import com.fasterxml.jackson.databind.JsonNode;
import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.util.Objects;
import java.util.UUID;

/**
 * Append-only ledger of every station transition per visit.
 * Partitioned monthly by created_at. No UPDATE or DELETE — DB trigger blocks mutation.
 *
 * duration_in_prev_station_seconds is computed by fn_compute_journey_duration()
 * BEFORE INSERT trigger — the app does not set it.
 *
 * op_visit_id FK to op_visits is enforced at DB level (added in V29);
 * stored as raw UUID here to avoid circular dependency at the entity layer.
 */
@Entity
@Table(name = "patient_journey_events")
@Getter
public class PatientJourneyEvent extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    /** Nullable — NULL only for future IP-only transitions. FK → op_visits enforced at DB level. */
    @Column(updatable = false)
    private UUID opVisitId;

    /** NULL on the first event of a visit (patient just arrived). */
    @Column(updatable = false)
    private UUID fromStationId;

    @Column(nullable = false, updatable = false)
    private UUID toStationId;

    @Column(updatable = false)
    private UUID triggeredByUserId;

    /** Computed by BEFORE INSERT trigger fn_compute_journey_duration(). App sends NULL; trigger overwrites. */
    @Column(updatable = false)
    private Integer durationInPrevStationSeconds;

    @Column(updatable = false)
    private String reason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
    private JsonNode metadata;

    protected PatientJourneyEvent() {}

    public PatientJourneyEvent(UUID patientId, UUID opVisitId, UUID fromStationId,
                               UUID toStationId, UUID triggeredByUserId,
                               String reason, JsonNode metadata, UUID createdBy) {
        this.patientId          = patientId;
        this.opVisitId          = opVisitId;
        this.fromStationId      = fromStationId;
        this.toStationId        = toStationId;
        this.triggeredByUserId  = triggeredByUserId;
        this.reason             = reason;
        this.metadata           = metadata;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PatientJourneyEvent e)) return false;
        return Objects.equals(id, e.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
