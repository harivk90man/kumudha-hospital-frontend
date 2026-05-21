package com.hospital.management.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface HospitalProfileRepository extends JpaRepository<HospitalProfile, UUID> {

    Optional<HospitalProfile> findFirstByDeletedAtIsNull();
}
