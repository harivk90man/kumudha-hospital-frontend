package com.hospital.management.platform.rbac;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface UserRoleRepository extends JpaRepository<UserRole, UserRoleId> {

    List<UserRole> findByIdUserId(UUID userId);

    Optional<UserRole> findByIdUserIdAndIsPrimaryTrue(UUID userId);

    boolean existsByIdUserIdAndIdRoleId(UUID userId, UUID roleId);

    @Transactional
    void deleteByIdUserId(UUID userId);
}
