package com.hospital.management.platform.config;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "holidays")
@Getter
public class Holiday extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private LocalDate holidayDate;

    @Setter @Column(nullable = false)
    private String holidayName;

    @Setter @Column
    private String description;

    /** TRUE = same date repeats every year (e.g. Independence Day). */
    @Setter @Column(nullable = false)
    private boolean recurring;

    protected Holiday() {}

    public Holiday(LocalDate holidayDate, String holidayName, boolean recurring, UUID createdBy) {
        this.holidayDate  = holidayDate;
        this.holidayName  = holidayName;
        this.recurring    = recurring;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Holiday h)) return false;
        return Objects.equals(holidayDate, h.holidayDate) && Objects.equals(holidayName, h.holidayName);
    }

    @Override
    public int hashCode() { return Objects.hash(holidayDate, holidayName); }
}
