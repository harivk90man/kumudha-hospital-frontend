package com.hospital.management.platform.audit;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Version;
import lombok.Getter;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Uniform 7-column audit + soft-delete block present on every v3 table.
 *
 * version is owned by Hibernate @Version (optimistic locking).
 * fn_touch_updated() trigger must only set updated_at — NOT version —
 * to avoid double-increment that breaks Hibernate's OL WHERE check.
 */
@MappedSuperclass
@Getter
public abstract class AuditableEntity {

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    private UUID updatedBy;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(nullable = false)
    private int version;

    private OffsetDateTime deletedAt;

    private UUID deletedBy;

    @PrePersist
    protected void onInsert() {
        createdAt = OffsetDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public void setCreatedBy(UUID createdBy) {
        this.createdBy = createdBy;
    }

    public void setUpdatedBy(UUID updatedBy) {
        this.updatedBy = updatedBy;
    }

    public void softDelete(UUID actor) {
        this.deletedAt = OffsetDateTime.now();
        this.deletedBy = actor;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}
