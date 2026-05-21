package com.hospital.management.platform.identity;

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
@Table(name = "departments")
@Getter
public class Department extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Setter @Column(nullable = false, unique = true)
    private String departmentCode;

    @Setter @Column(nullable = false)
    private String departmentName;

    @Setter @Column
    private String description;

    protected Department() {}

    public Department(String departmentCode, String departmentName, UUID createdBy) {
        this.departmentCode = departmentCode;
        this.departmentName = departmentName;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Department d)) return false;
        return departmentCode != null && departmentCode.equals(d.departmentCode);
    }

    @Override
    public int hashCode() { return Objects.hash(departmentCode); }
}
