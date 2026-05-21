package com.hospital.management.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DoctorProfileRepository extends JpaRepository<DoctorProfile, UUID> {

    Optional<DoctorProfile> findByUser_IdAndDeletedAtIsNull(UUID userId);

    boolean existsByUser_IdAndDeletedAtIsNull(UUID userId);
}
