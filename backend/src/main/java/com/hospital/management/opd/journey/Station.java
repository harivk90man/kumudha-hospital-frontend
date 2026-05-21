package com.hospital.management.opd.journey;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

/**
 * Physical service-point registry. Flyway-seeded at deployment; one row per station_type.
 * station_type: front_desk | vitals | doctor | lab_collection | lab_processing | radiology | pharmacy | billing
 */
@Entity
@Table(name = "stations")
@Getter
public class Station extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false, unique = true)
    private String stationType;

    protected Station() {}

    public Station(String displayName, String stationType, UUID createdBy) {
        this.displayName  = displayName;
        this.stationType  = stationType;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Station s)) return false;
        return stationType != null && stationType.equals(s.stationType);
    }

    @Override
    public int hashCode() { return Objects.hash(stationType); }

    @Override
    public String toString() { return "Station[type=" + stationType + ", name=" + displayName + "]"; }
}
