package com.hospital.management.platform.config;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface HolidayRepository extends JpaRepository<Holiday, UUID> {

    List<Holiday> findAllByDeletedAtIsNull();

    boolean existsByHolidayDateAndDeletedAtIsNull(LocalDate date);
}
