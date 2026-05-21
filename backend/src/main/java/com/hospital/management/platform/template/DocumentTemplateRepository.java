package com.hospital.management.platform.template;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface DocumentTemplateRepository extends JpaRepository<DocumentTemplate, UUID> {

    Optional<DocumentTemplate> findByTemplateTypeAndActiveTrue(String templateType);

    boolean existsByTemplateTypeAndActiveTrue(String templateType);
}
