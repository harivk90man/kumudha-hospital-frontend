package com.hospital.management.platform.rbac;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RoleRepository extends JpaRepository<Role, UUID> {

    Optional<Role> findByRoleCodeAndDeletedAtIsNull(String roleCode);

    List<Role> findAllByDeletedAtIsNull();
}
