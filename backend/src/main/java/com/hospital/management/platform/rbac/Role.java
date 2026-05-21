package com.hospital.management.platform.rbac;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "roles")
@Getter
public class Role extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String roleCode;

    @Setter @Column(nullable = false)
    private String displayName;

    @Setter @Column
    private String description;

    /** System roles (admin, doctor, etc.) cannot be soft-deleted. */
    @Column(nullable = false)
    private boolean systemRole;

    protected Role() {}

    public Role(String roleCode, String displayName, boolean systemRole, UUID createdBy) {
        this.roleCode    = roleCode;
        this.displayName = displayName;
        this.systemRole  = systemRole;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Role r)) return false;
        return roleCode != null && roleCode.equals(r.roleCode);
    }

    @Override
    public int hashCode() { return Objects.hash(roleCode); }
}
