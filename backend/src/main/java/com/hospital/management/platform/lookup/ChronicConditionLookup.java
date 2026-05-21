package com.hospital.management.platform.lookup;

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
@Table(name = "chronic_conditions_lookup")
@Getter
public class ChronicConditionLookup extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String conditionCode;

    @Setter @Column(nullable = false)
    private String conditionName;

    @Setter @Column
    private String icdCode;

    @Setter @Column
    private String category;

    protected ChronicConditionLookup() {}

    public ChronicConditionLookup(String conditionCode, String conditionName, UUID createdBy) {
        this.conditionCode = conditionCode;
        this.conditionName = conditionName;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ChronicConditionLookup c)) return false;
        return Objects.equals(conditionCode, c.conditionCode);
    }

    @Override
    public int hashCode() { return Objects.hash(conditionCode); }
}
