package com.hospital.management.platform.identity;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Individual doctor leave / unavailability day.
 * Appointment slot generator checks this table before creating slots for a doctor.
 * Distinct from hospital-wide holidays (holidays table).
 */
@Entity
@Table(name = "doctor_leaves")
@Getter
public class DoctorLeave extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID doctorId;

    @Column(nullable = false)
    private LocalDate leaveDate;

    /** sick | vacation | conference | emergency | other */
    @Setter @Column(nullable = false)
    private String leaveType;

    @Setter @Column
    private String reason;

    @Setter @Column
    private UUID approvedBy;

    protected DoctorLeave() {}

    public DoctorLeave(UUID doctorId, LocalDate leaveDate, String leaveType,
                       String reason, UUID createdBy) {
        this.doctorId  = doctorId;
        this.leaveDate = leaveDate;
        this.leaveType = leaveType;
        this.reason    = reason;
        setCreatedBy(createdBy);
    }

    public void approve(UUID approver) {
        this.approvedBy = approver;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DoctorLeave l)) return false;
        return Objects.equals(doctorId, l.doctorId) && Objects.equals(leaveDate, l.leaveDate);
    }

    @Override
    public int hashCode() { return Objects.hash(doctorId, leaveDate); }
}
