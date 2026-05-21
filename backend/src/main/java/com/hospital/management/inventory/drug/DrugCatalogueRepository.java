package com.hospital.management.inventory.drug;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DrugCatalogueRepository extends JpaRepository<DrugCatalogue, UUID> {

    Optional<DrugCatalogue> findByDrugCodeAndDeletedAtIsNull(String drugCode);

    List<DrugCatalogue> findByIsNarcoticTrueAndDeletedAtIsNull();

    List<DrugCatalogue> findByFormAndDeletedAtIsNull(String form);

    List<DrugCatalogue> findByDrugScheduleAndDeletedAtIsNull(String drugSchedule);
}
