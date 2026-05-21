package com.hospital.management.platform.rbac;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * CRUD-per-table permission grant.
 * action values: CREATE | READ | UPDATE | DELETE
 */
@Entity
@Table(name = "role_permissions")
@Getter
public class RolePermission {

    @EmbeddedId
    private RolePermissionId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("roleId")
    @JoinColumn(name = "role_id")
    private Role role;

    @Column(nullable = false, updatable = false)
    private UUID grantedBy;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime grantedAt;

    protected RolePermission() {}

    public RolePermission(Role role, String tableName, String action, UUID grantedBy) {
        this.id        = new RolePermissionId(role.getId(), tableName, action);
        this.role      = role;
        this.grantedBy = grantedBy;
        this.grantedAt = OffsetDateTime.now();
    }

    public String getTableName() { return id.getTableName(); }
    public String getAction()    { return id.getAction(); }
}
