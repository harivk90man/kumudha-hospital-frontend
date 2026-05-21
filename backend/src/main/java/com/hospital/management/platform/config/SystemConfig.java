package com.hospital.management.platform.config;

import com.hospital.management.platform.audit.AuditableEntity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Hospital-wide configuration.
 * config_value is jsonb — shape varies by key; consumers cast to their typed POJO.
 * L2 maker-checker: sensitive changes require a second approver.
 */
@Entity
@Table(name = "system_config")
@Getter
public class SystemConfig extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String configKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode configValue;

    @Setter @Column
    private String description;

    @Column(nullable = false)
    private boolean sensitive;

    // ── L2 maker-checker ─────────────────────────────────────────────────────
    @Column(nullable = false)
    private String approvalStatus;

    @Column
    private UUID approvedBy;

    @Column
    private OffsetDateTime approvedAt;

    @Column
    private String rejectionReason;

    protected SystemConfig() {}

    public SystemConfig(String configKey, JsonNode configValue, boolean sensitive, UUID createdBy) {
        this.configKey      = configKey;
        this.configValue    = configValue;
        this.sensitive      = sensitive;
        this.approvalStatus = "pending_approval";
        setCreatedBy(createdBy);
    }

    public void updateValue(JsonNode newValue) {
        this.configValue    = newValue;
        this.approvalStatus = "pending_approval";
        this.approvedBy     = null;
        this.approvedAt     = null;
    }

    public void approve(UUID approver) {
        this.approvalStatus = "approved";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SystemConfig s)) return false;
        return configKey != null && configKey.equals(s.configKey);
    }

    @Override
    public int hashCode() { return Objects.hash(configKey); }
}
