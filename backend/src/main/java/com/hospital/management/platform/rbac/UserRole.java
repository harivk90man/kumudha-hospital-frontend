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
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_roles")
@Getter
public class UserRole {

    @EmbeddedId
    private UserRoleId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("roleId")
    @JoinColumn(name = "role_id")
    private Role role;

    /**
     * True on exactly one active row per user — enforced by uq_user_roles_primary partial unique index.
     * Identifies the role returned in the login response and used for UI portal routing.
     */
    @Setter
    @Column(nullable = false)
    private boolean isPrimary;

    @Column(nullable = false, updatable = false)
    private UUID createdBy;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected UserRole() {}

    public UserRole(UUID userId, Role role, boolean isPrimary, UUID createdBy) {
        this.id        = new UserRoleId(userId, role.getId());
        this.role      = role;
        this.isPrimary = isPrimary;
        this.createdBy = createdBy;
        this.createdAt = OffsetDateTime.now();
    }

    public UUID getUserId() { return id.getUserId(); }
}
