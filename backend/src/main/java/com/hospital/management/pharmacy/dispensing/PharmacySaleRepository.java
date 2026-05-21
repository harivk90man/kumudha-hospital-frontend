package com.hospital.management.pharmacy.dispensing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PharmacySaleRepository extends JpaRepository<PharmacySale, UUID> {

    Optional<PharmacySale> findBySaleNumberAndDeletedAtIsNull(String saleNumber);

    Optional<PharmacySale> findByIdempotencyKeyAndDeletedAtIsNull(UUID idempotencyKey);

    List<PharmacySale> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    List<PharmacySale> findByPrescriptionIdAndDeletedAtIsNull(UUID prescriptionId);

    List<PharmacySale> findByStatusAndDeletedAtIsNull(String status);
}
