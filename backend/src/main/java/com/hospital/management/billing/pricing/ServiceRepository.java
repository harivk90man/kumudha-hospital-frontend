package com.hospital.management.billing.pricing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface ServiceRepository extends JpaRepository<Service, UUID> {

    Optional<Service> findByServiceCodeAndDeletedAtIsNull(String serviceCode);

    List<Service> findByServiceTypeAndDeletedAtIsNull(String serviceType);

    List<Service> findByDepartmentIdAndDeletedAtIsNull(UUID departmentId);

    List<Service> findByDeletedAtIsNull();
}
