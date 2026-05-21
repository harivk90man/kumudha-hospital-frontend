package com.hospital.management.clinical.consultation;

import com.fasterxml.jackson.databind.JsonNode;
import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.util.Objects;
import java.util.UUID;

/**
 * Shortcut template for common diagnoses. Doctors select a template to pre-fill
 * consultation fields (diagnoses, advice, follow-up instructions).
 * Scoped by department and/or specialty; NULL = hospital-wide.
 */
@Entity
@Table(name = "diagnosis_templates")
@Getter
public class DiagnosisTemplate extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Setter @Column(nullable = false)
    private String templateName;

    /** FK → departments(id) RESTRICT. NULL = hospital-wide template. */
    @Setter @Column
    private UUID departmentId;

    @Setter @Column
    private String specialty;

    @Setter @Column(name = "icd10_code")
    private String icd10Code;

    @Setter @Column(nullable = false)
    private String diagnosisText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Setter @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode templateJson;

    @Setter @Column
    private String defaultAdvice;

    @Setter @Column
    private Integer defaultFollowupDays;

    protected DiagnosisTemplate() {}

    public DiagnosisTemplate(String templateName, String diagnosisText,
                             JsonNode templateJson, UUID createdBy) {
        this.templateName  = templateName;
        this.diagnosisText = diagnosisText;
        this.templateJson  = templateJson;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DiagnosisTemplate t)) return false;
        return Objects.equals(id, t.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
