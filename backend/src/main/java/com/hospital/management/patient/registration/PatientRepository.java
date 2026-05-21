package com.hospital.management.patient.registration;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PatientRepository extends JpaRepository<Patient, UUID> {

    Optional<Patient> findByUhidAndDeletedAtIsNull(String uhid);

    Optional<Patient> findByIdAndDeletedAtIsNull(UUID id);

    Optional<Patient> findByMobileAndDeletedAtIsNull(String mobile);

    Page<Patient> findAllByDeletedAtIsNull(Pageable pageable);

    boolean existsByUhidAndDeletedAtIsNull(String uhid);

    boolean existsByMobileAndDeletedAtIsNull(String mobile);
}
