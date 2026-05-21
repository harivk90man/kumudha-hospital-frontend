package com.hospital.management.opd.journey;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientJourneyEventRepository extends JpaRepository<PatientJourneyEvent, UUID> {

    List<PatientJourneyEvent> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

    List<PatientJourneyEvent> findByOpVisitIdOrderByCreatedAtDesc(UUID opVisitId);
}
