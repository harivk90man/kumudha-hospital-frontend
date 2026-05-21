package com.hospital.management.clinical.consultation;

import com.fasterxml.jackson.databind.JsonNode;
import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Clinical note for one OP visit. status=draft is fully editable.
 * status=locked makes all clinical columns immutable — enforced by fn_consultation_lock_guard() DB trigger.
 *
 * diagnoses is a jsonb array of ICD-10 coded entries.
 * examinationFindings is a jsonb object (system-by-system findings).
 */
@Entity
@Table(name = "consultations")
@Getter
public class Consultation extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID opVisitId;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    @Column(nullable = false)
    private UUID doctorId;

    @Setter @Column
    private String chiefComplaint;

    @Setter @Column
    private String historyOfPresentIllness;

    @Setter @Column
    private String pastHistory;

    @JdbcTypeCode(SqlTypes.JSON)
    @Setter @Column(columnDefinition = "jsonb")
    private JsonNode examinationFindings;

    /** Array of ICD-10 coded diagnosis entries. Default '[]'. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Setter @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode diagnoses;

    @Setter @Column
    private String symptoms;

    @Setter @Column
    private String clinicalNotes;

    @Setter @Column
    private String advice;

    @Setter @Column(nullable = false)
    private String nextAction;

    @Column(nullable = false)
    private boolean followUpRequired;

    @Setter @Column
    private LocalDate followUpDate;

    @Column
    private OffsetDateTime lockedAt;

    protected Consultation() {}

    public Consultation(UUID opVisitId, UUID patientId, UUID doctorId,
                        JsonNode diagnoses, UUID createdBy) {
        this.opVisitId       = opVisitId;
        this.patientId       = patientId;
        this.doctorId        = doctorId;
        this.status          = "draft";
        this.diagnoses       = diagnoses;
        this.nextAction      = "no_action";
        this.followUpRequired = false;
        setCreatedBy(createdBy);
    }

    public void lock(UUID actorId) {
        this.status   = "locked";
        this.lockedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public boolean isDraft()  { return "draft".equals(status); }
    public boolean isLocked() { return "locked".equals(status); }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Consultation c)) return false;
        return Objects.equals(opVisitId, c.opVisitId);
    }

    @Override
    public int hashCode() { return Objects.hash(opVisitId); }
}
