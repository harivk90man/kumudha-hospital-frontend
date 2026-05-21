package com.hospital.management.platform.template;

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

/**
 * Versioned print templates.
 * template_type: prescription | invoice | lab_report | discharge_summary | receipt
 * body: text with {{placeholder}} tokens resolved at render time.
 * Only one active template per type — enforced by partial unique index in migration.
 */
@Entity
@Table(name = "document_templates")
@Getter
public class DocumentTemplate extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private String templateType;

    @Setter @Column(nullable = false)
    private String templateName;

    @Column(nullable = false)
    private int versionNo;

    @Setter @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(nullable = false)
    private boolean active;

    protected DocumentTemplate() {}

    public DocumentTemplate(String templateType, String templateName, String body,
                            int versionNo, UUID createdBy) {
        this.templateType = templateType;
        this.templateName = templateName;
        this.body         = body;
        this.versionNo    = versionNo;
        this.active       = true;
        setCreatedBy(createdBy);
    }

    public void deactivate() { this.active = false; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DocumentTemplate t)) return false;
        return Objects.equals(templateType, t.templateType) && versionNo == t.versionNo;
    }

    @Override
    public int hashCode() { return Objects.hash(templateType, versionNo); }
}
