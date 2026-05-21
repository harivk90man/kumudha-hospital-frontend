package com.hospital.management.clinical.vitals;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface VitalsRepository extends JpaRepository<Vitals, UUID> {

    List<Vitals> findByOpVisitIdOrderByCreatedAtDesc(UUID opVisitId);

    List<Vitals> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    Optional<Vitals> findTopByOpVisitIdOrderByCreatedAtDesc(UUID opVisitId);
}
