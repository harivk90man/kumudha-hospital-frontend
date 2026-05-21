package com.hospital.management.platform.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;
import java.util.UUID;

@Transactional(readOnly = true)
public interface AuditExcludedTableRepository extends JpaRepository<AuditExcludedTable, UUID> {

    Set<AuditExcludedTable> findAllBy();
}
