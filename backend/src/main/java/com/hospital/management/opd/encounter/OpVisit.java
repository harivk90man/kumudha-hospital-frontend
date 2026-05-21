package com.hospital.management.opd.encounter;

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
 * Aggregate root for an outpatient encounter. opNumber is app-generated (e.g. OP-2026-00101).
 * All clinical records (consultations, prescriptions, lab orders, radiology, invoices) FK here.
 *
 * appointment_id is nullable — NULL for walk-in patients.
 * is_mlc and mlc_number track medico-legal cases.
 * closed_at is set when the visit is dismissed — used for duration analytics.
 */
@Entity
@Table(name = "op_visits")
@Getter
public class OpVisit extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String opNumber;

    @Column(nullable = false, updatable = false)
    private UUID patientId;

    /** FK → appointments(id) RESTRICT. NULL for walk-ins. */
    @Column(updatable = false)
    private UUID appointmentId;

    @Setter @Column(nullable = false)
    private UUID doctorId;

    @Column(nullable = false, updatable = false)
    private LocalDate visitDate;

    @Setter @Column
    private String chiefComplaint;

    @Setter @Column
    private OffsetDateTime closedAt;

    @Column(nullable = false)
    private boolean isEmergency;

    @Setter @Column
    private String emergencyTriage;

    @Column(nullable = false)
    private boolean isMlc;

    @Setter @Column
    private String mlcNumber;

    protected OpVisit() {}

    public OpVisit(String opNumber, UUID patientId, UUID appointmentId,
                   UUID doctorId, LocalDate visitDate, UUID createdBy) {
        this.opNumber      = opNumber;
        this.patientId     = patientId;
        this.appointmentId = appointmentId;
        this.doctorId      = doctorId;
        this.visitDate     = visitDate;
        this.isEmergency   = false;
        this.isMlc         = false;
        setCreatedBy(createdBy);
    }

    public void flagEmergency(String triage, UUID actorId) {
        this.isEmergency     = true;
        this.emergencyTriage = triage;
        setUpdatedBy(actorId);
    }

    public void flagMlc(String mlcNo, UUID actorId) {
        this.isMlc     = true;
        this.mlcNumber = mlcNo;
        setUpdatedBy(actorId);
    }

    public void close(UUID actorId) {
        this.closedAt = OffsetDateTime.now();
        setUpdatedBy(actorId);
    }

    public boolean isOpen() { return closedAt == null; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof OpVisit v)) return false;
        return opNumber != null && opNumber.equals(v.opNumber);
    }

    @Override
    public int hashCode() { return Objects.hash(opNumber); }

    @Override
    public String toString() {
        return "OpVisit[opNumber=" + opNumber + ", patient=" + patientId + "]";
    }
}
