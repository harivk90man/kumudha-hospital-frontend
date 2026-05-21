package com.hospital.management.inventory.vendor;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface VendorRepository extends JpaRepository<Vendor, UUID> {

    Optional<Vendor> findByVendorCodeAndDeletedAtIsNull(String vendorCode);

    List<Vendor> findByDeletedAtIsNull();

    List<Vendor> findByIsNarcoticSupplierTrueAndDeletedAtIsNull();
}
