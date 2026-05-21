package com.hospital.management.platform.config;

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
@Table(name = "user_preferences")
@Getter
public class UserPreference extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String preferenceKey;

    @Setter @Column(nullable = false)
    private String preferenceValue;

    protected UserPreference() {}

    public UserPreference(UUID userId, String preferenceKey, String preferenceValue, UUID createdBy) {
        this.userId          = userId;
        this.preferenceKey   = preferenceKey;
        this.preferenceValue = preferenceValue;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserPreference p)) return false;
        return Objects.equals(userId, p.userId) && Objects.equals(preferenceKey, p.preferenceKey);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, preferenceKey); }
}
