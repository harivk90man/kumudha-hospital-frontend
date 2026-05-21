package com.hospital.management.platform.identity;

import com.hospital.management.platform.audit.AuditableEntity;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/**
 * Singleton — exactly one live row enforced by a partial unique index in the migration.
 * App reads this once at startup: SELECT * FROM hospital_profile LIMIT 1.
 * address is jsonb mapped to HospitalAddress record.
 */
@Entity
@Table(name = "hospital_profile")
@Getter
public class HospitalProfile extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Setter @Column(nullable = false, unique = true)
    private String hospitalCode;

    @Setter @Column(nullable = false)
    private String hospitalName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private HospitalAddress address;

    @Setter @Column
    private String gstNumber;

    @Setter @Column
    private String licenseNumber;

    @Setter @Column
    private String logoPath;

    @Setter @Column(nullable = false)
    private String timezone;

    // ── UHID format ───────────────────────────────────────────────────────────

    @Setter @Column(nullable = false)
    private String uhidPrefix;

    @Setter @Column(nullable = false)
    private String uhidSeparator;

    @Setter @Column(nullable = false)
    private int uhidSequencePadding;

    @Setter @Column(nullable = false)
    private boolean uhidIncludeYear;

    protected HospitalProfile() {}

    public void updateAddress(HospitalAddress address) {
        this.address = address;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof HospitalProfile h)) return false;
        return hospitalCode != null && hospitalCode.equals(h.hospitalCode);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(hospitalCode);
    }
}
