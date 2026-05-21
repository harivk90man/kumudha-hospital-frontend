package com.hospital.management.platform.rbac;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface RolePermissionRepository extends JpaRepository<RolePermission, RolePermissionId> {

    List<RolePermission> findByIdRoleId(UUID roleId);

    boolean existsByIdRoleIdAndIdTableNameAndIdAction(UUID roleId, String tableName, String action);
}
