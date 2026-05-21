package com.hospital.management.lab.catalogue;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabTestRepository extends JpaRepository<LabTest, UUID> {

    Optional<LabTest> findByTestCodeAndDeletedAtIsNull(String testCode);

    List<LabTest> findByCategoryAndDeletedAtIsNull(String category);

    List<LabTest> findByDeletedAtIsNull();
}
