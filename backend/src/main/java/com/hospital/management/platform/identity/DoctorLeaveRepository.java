package com.hospital.management.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DoctorLeaveRepository extends JpaRepository<DoctorLeave, UUID> {

    /** Used by slot generator: is this doctor on leave for a given date? */
    boolean existsByDoctorIdAndLeaveDateAndDeletedAtIsNull(UUID doctorId, LocalDate date);

    /** All leave dates for a doctor in a date range — used when pre-generating slots. */
    List<DoctorLeave> findByDoctorIdAndLeaveDateBetweenAndDeletedAtIsNull(
            UUID doctorId, LocalDate from, LocalDate to);

    List<DoctorLeave> findByDoctorIdAndDeletedAtIsNull(UUID doctorId);
}
