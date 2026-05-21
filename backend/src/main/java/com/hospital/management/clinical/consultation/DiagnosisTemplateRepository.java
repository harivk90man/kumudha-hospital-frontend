package com.hospital.management.clinical.consultation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DiagnosisTemplateRepository extends JpaRepository<DiagnosisTemplate, UUID> {

    List<DiagnosisTemplate> findByDepartmentIdAndDeletedAtIsNull(UUID departmentId);

    List<DiagnosisTemplate> findBySpecialtyAndDeletedAtIsNull(String specialty);

    List<DiagnosisTemplate> findByDepartmentIdIsNullAndDeletedAtIsNull();
}
