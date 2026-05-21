package com.hospital.management.platform.lookup;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface ChronicConditionLookupRepository extends JpaRepository<ChronicConditionLookup, UUID> {

    List<ChronicConditionLookup> findAllByDeletedAtIsNull();

    Optional<ChronicConditionLookup> findByConditionCodeAndDeletedAtIsNull(String code);

    Optional<ChronicConditionLookup> findByConditionNameIgnoreCaseAndDeletedAtIsNull(String name);
}
