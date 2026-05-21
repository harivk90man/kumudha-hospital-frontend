package com.hospital.management.platform.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "audit_excluded_tables")
@Getter
public class AuditExcludedTable {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String tableName;

    @Column(nullable = false)
    private String reason;

    @Column(nullable = false, updatable = false)
    private UUID createdBy;

    @Column(nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    protected AuditExcludedTable() {}

    public AuditExcludedTable(String tableName, String reason, UUID createdBy) {
        this.tableName = tableName;
        this.reason    = reason;
        this.createdBy = createdBy;
        this.createdAt = OffsetDateTime.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AuditExcludedTable t)) return false;
        return Objects.equals(tableName, t.tableName);
    }

    @Override
    public int hashCode() { return Objects.hash(tableName); }
}
