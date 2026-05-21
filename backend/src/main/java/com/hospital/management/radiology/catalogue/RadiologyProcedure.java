package com.hospital.management.radiology.catalogue;

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
 * Radiology procedure catalogue.
 * modality: xray | ultrasound | ct | mri | mammography | dexa | fluoroscopy | nuclear | other
 * serviceId FK to services(id) added in pricing module migration.
 */
@Entity
@Table(name = "radiology_procedures")
@Getter
public class RadiologyProcedure extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String procedureCode;

    @Setter @Column(nullable = false)
    private String procedureName;

    @Setter @Column(nullable = false)
    private String modality;

    @Setter @Column
    private String bodyPart;

    /** FK → departments(id) RESTRICT. NULL = available across departments. */
    @Setter @Column
    private UUID departmentId;

    /** FK → services(id) RESTRICT — constraint added in pricing module migration. */
    @Column(nullable = false)
    private UUID serviceId;

    @Setter @Column
    private Integer typicalDurationMins;

    @Setter @Column(nullable = false)
    private boolean requiresFasting;

    @Setter @Column(nullable = false)
    private boolean requiresRadiologistPresence;

    @Setter @Column
    private String sacCode;

    @Setter @Column
    private String description;

    protected RadiologyProcedure() {}

    public RadiologyProcedure(String procedureCode, String procedureName,
                              String modality, UUID serviceId, UUID createdBy) {
        this.procedureCode               = procedureCode;
        this.procedureName               = procedureName;
        this.modality                    = modality;
        this.serviceId                   = serviceId;
        this.requiresFasting             = false;
        this.requiresRadiologistPresence = false;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RadiologyProcedure p)) return false;
        return procedureCode != null && procedureCode.equals(p.procedureCode);
    }

    @Override
    public int hashCode() { return Objects.hash(procedureCode); }
}
