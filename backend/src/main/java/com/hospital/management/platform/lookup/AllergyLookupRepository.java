package com.hospital.management.platform.lookup;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface AllergyLookupRepository extends JpaRepository<AllergyLookup, UUID> {

    List<AllergyLookup> findAllByDeletedAtIsNull();

    Optional<AllergyLookup> findByAllergyCodeAndDeletedAtIsNull(String code);

    Optional<AllergyLookup> findByAllergyNameIgnoreCaseAndDeletedAtIsNull(String name);
}
