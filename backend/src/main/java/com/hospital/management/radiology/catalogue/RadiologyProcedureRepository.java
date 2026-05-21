package com.hospital.management.radiology.catalogue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RadiologyProcedureRepository extends JpaRepository<RadiologyProcedure, UUID> {

    Optional<RadiologyProcedure> findByProcedureCodeAndDeletedAtIsNull(String procedureCode);

    List<RadiologyProcedure> findByModalityAndDeletedAtIsNull(String modality);

    List<RadiologyProcedure> findByDeletedAtIsNull();
}
