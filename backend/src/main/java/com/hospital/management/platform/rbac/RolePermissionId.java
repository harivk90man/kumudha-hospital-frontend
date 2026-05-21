package com.hospital.management.platform.rbac;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class RolePermissionId implements Serializable {

    @Column(name = "role_id", nullable = false)
    private UUID roleId;

    @Column(name = "table_name", nullable = false)
    private String tableName;

    @Column(name = "action", nullable = false)
    private String action;

    protected RolePermissionId() {}

    public RolePermissionId(UUID roleId, String tableName, String action) {
        this.roleId    = roleId;
        this.tableName = tableName;
        this.action    = action;
    }

    public UUID getRoleId()    { return roleId; }
    public String getTableName() { return tableName; }
    public String getAction()    { return action; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RolePermissionId id)) return false;
        return Objects.equals(roleId, id.roleId)
            && Objects.equals(tableName, id.tableName)
            && Objects.equals(action, id.action);
    }

    @Override
    public int hashCode() { return Objects.hash(roleId, tableName, action); }
}
