package com.hospital.management.opd.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface AppointmentSlotRepository extends JpaRepository<AppointmentSlot, UUID> {

    List<AppointmentSlot> findByDoctorIdAndStatusAndSlotStartBetweenAndDeletedAtIsNull(
            UUID doctorId, String status, OffsetDateTime from, OffsetDateTime to);

    boolean existsByDoctorIdAndSlotStartAndDeletedAtIsNull(UUID doctorId, OffsetDateTime slotStart);
}
