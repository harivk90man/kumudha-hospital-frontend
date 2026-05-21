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
@Table(name = "allergies_lookup")
@Getter
public class AllergyLookup extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String allergyCode;

    @Setter @Column(nullable = false)
    private String allergyName;

    /** food | drug | environmental | other */
    @Setter @Column(nullable = false)
    private String category;

    /** SNOMED / ICD code for interoperability — nullable */
    @Setter @Column
    private String standardCode;

    protected AllergyLookup() {}

    public AllergyLookup(String allergyCode, String allergyName, String category, UUID createdBy) {
        this.allergyCode = allergyCode;
        this.allergyName = allergyName;
        this.category    = category;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AllergyLookup a)) return false;
        return Objects.equals(allergyCode, a.allergyCode);
    }

    @Override
    public int hashCode() { return Objects.hash(allergyCode); }
}
