package com.hospital.management.opd.encounter;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface OpVisitRepository extends JpaRepository<OpVisit, UUID> {

    Optional<OpVisit> findByOpNumberAndDeletedAtIsNull(String opNumber);

    List<OpVisit> findByPatientIdAndDeletedAtIsNull(UUID patientId);

    List<OpVisit> findByDoctorIdAndVisitDateAndDeletedAtIsNull(UUID doctorId, LocalDate visitDate);

    List<OpVisit> findByVisitDateAndDeletedAtIsNull(LocalDate visitDate);

    List<OpVisit> findByVisitDateAndIsEmergencyTrueAndDeletedAtIsNull(LocalDate visitDate);

    Optional<OpVisit> findByAppointmentIdAndDeletedAtIsNull(UUID appointmentId);
}
