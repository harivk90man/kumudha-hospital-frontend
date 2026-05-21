package com.hospital.management.inventory.vendor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface VendorContactRepository extends JpaRepository<VendorContact, UUID> {

    List<VendorContact> findByVendorIdAndDeletedAtIsNull(UUID vendorId);

    Optional<VendorContact> findByVendorIdAndIsPrimaryTrueAndDeletedAtIsNull(UUID vendorId);
}
