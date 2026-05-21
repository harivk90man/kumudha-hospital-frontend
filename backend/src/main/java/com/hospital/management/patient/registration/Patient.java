package com.hospital.management.patient.registration;

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

import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * Core clinical entity — every OPD visit, prescription, lab order, and invoice
 * traces back to a patient row.
 *
 * UHID is generated at registration using the format in hospital_profile.
 * address_city and address_pincode are GENERATED ALWAYS AS columns in the DB
 * — mapped insertable=false/updatable=false so Hibernate never writes them.
 *
 * Allergies and chronic conditions live in child tables (patient_allergies,
 * patient_chronic_conditions) — not arrays on this entity.
 */
@Entity
@Table(name = "patients")
@Getter
public class Patient extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String uhid;

    @Setter @Column(nullable = false)
    private String firstName;

    @Setter @Column(nullable = false)
    private String lastName;

    @Setter @Column(nullable = false)
    private LocalDate dateOfBirth;

    @Setter @Column(nullable = false)
    private String gender;

    @Setter @Column
    private String bloodGroup;

    @Setter @Column
    private String mobile;

    @Setter @Column
    private String altMobile;

    @Setter @Column
    private String email;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private PatientAddress address;

    /** GENERATED ALWAYS AS ((address->>'city')) STORED — read-only from DB. */
    @Column(insertable = false, updatable = false)
    private String addressCity;

    /** GENERATED ALWAYS AS ((address->>'pincode')) STORED — read-only from DB. */
    @Column(insertable = false, updatable = false)
    private String addressPincode;

    @Setter @Column
    private String emergencyContactName;

    @Setter @Column
    private String emergencyContactMobile;

    @Setter @Column
    private String emergencyContactRelation;

    @Column(nullable = false)
    private String createdVia;

    @Column(nullable = false)
    private boolean isDeceased;

    @Setter @Column
    private LocalDate deceasedAt;

    protected Patient() {}

    public Patient(String uhid, String firstName, String lastName, LocalDate dateOfBirth,
                   String gender, String createdVia, UUID createdBy) {
        this.uhid        = uhid;
        this.firstName   = firstName;
        this.lastName    = lastName;
        this.dateOfBirth = dateOfBirth;
        this.gender      = gender;
        this.createdVia  = createdVia;
        this.isDeceased  = false;
        setCreatedBy(createdBy);
    }

    public void updateAddress(PatientAddress address) {
        this.address = address;
    }

    public void markDeceased(LocalDate date) {
        this.isDeceased = true;
        this.deceasedAt = date;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Patient p)) return false;
        return uhid != null && uhid.equals(p.uhid);
    }

    @Override
    public int hashCode() { return Objects.hash(uhid); }

    @Override
    public String toString() {
        return "Patient[uhid=" + uhid + ", name=" + firstName + " " + lastName + "]";
    }
}
