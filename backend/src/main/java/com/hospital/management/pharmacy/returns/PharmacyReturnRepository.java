package com.hospital.management.pharmacy.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PharmacyReturnRepository extends JpaRepository<PharmacyReturn, UUID> {

    Optional<PharmacyReturn> findByReturnNumberAndDeletedAtIsNull(String returnNumber);

    List<PharmacyReturn> findByOriginalSaleIdAndDeletedAtIsNull(UUID originalSaleId);

    List<PharmacyReturn> findByPatientIdAndDeletedAtIsNull(UUID patientId);
}
