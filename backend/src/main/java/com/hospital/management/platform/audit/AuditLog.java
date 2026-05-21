package com.hospital.management.platform.audit;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Append-only forensic audit trail — written by fn_audit_row() DB trigger.
 * Never written or updated by application code.
 * Read via JdbcTemplate only — this entity exists only for type safety on reads.
 * action values: INSERT | UPDATE | DELETE
 * Partitioned monthly by occurred_at in the DB.
 */
@Entity
@Immutable
@Table(name = "audit_logs")
@Getter
public class AuditLog {

    @Id
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(updatable = false, nullable = false)
    private String entityTable;

    @Column(updatable = false, nullable = false)
    private UUID entityId;

    @Column(updatable = false, nullable = false)
    private String action;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(updatable = false, columnDefinition = "jsonb")
    private JsonNode beforeState;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(updatable = false, columnDefinition = "jsonb")
    private JsonNode afterState;

    @Column(updatable = false)
    private String[] changedFields;

    @Column(updatable = false, nullable = false)
    private UUID actorId;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime occurredAt;

    protected AuditLog() {}
}
