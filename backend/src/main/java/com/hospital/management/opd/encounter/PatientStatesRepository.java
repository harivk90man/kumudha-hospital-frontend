package com.hospital.management.opd.encounter;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientStatesRepository extends JpaRepository<PatientStates, UUID> {

    /** Current active stage for a visit — at most one due to partial unique index. */
    Optional<PatientStates> findByOpVisitIdAndLeftAtIsNull(UUID opVisitId);

    /** Full stage history for a visit in chronological order. */
    List<PatientStates> findByOpVisitIdOrderByEnteredAtAsc(UUID opVisitId);

    /** All patients currently at a given station (live queue board). */
    List<PatientStates> findByStationIdAndLeftAtIsNullOrderByEnteredAtAsc(UUID stationId);

    /** Check if patient is currently active anywhere (prevent double-entry). */
    Optional<PatientStates> findByPatientIdAndLeftAtIsNull(UUID patientId);
}
