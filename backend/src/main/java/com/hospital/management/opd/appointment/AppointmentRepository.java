package com.hospital.management.opd.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {

    Optional<Appointment> findByAppointmentNoAndDeletedAtIsNull(String appointmentNo);

    List<Appointment> findByPatientIdAndDeletedAtIsNull(UUID patientId);

    List<Appointment> findByDoctorIdAndScheduledAtBetweenAndDeletedAtIsNull(
            UUID doctorId, OffsetDateTime from, OffsetDateTime to);

    List<Appointment> findByStatusAndDeletedAtIsNull(String status);

    boolean existsBySlotIdAndStatusNotInAndDeletedAtIsNull(UUID slotId, List<String> excludedStatuses);
}
