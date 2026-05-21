package com.hospital.management.platform.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DepartmentRepository extends JpaRepository<Department, UUID> {

    Optional<Department> findByDepartmentCodeAndDeletedAtIsNull(String code);

    List<Department> findAllByDeletedAtIsNull();

    boolean existsByDepartmentCodeAndDeletedAtIsNull(String code);
}
