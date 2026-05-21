package com.hospital.management.platform.identity;

import com.hospital.management.platform.audit.AuditableEntity;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Doctor-specific extension — one row per user with a doctor role.
 * available_days jsonb: {"mon":[{"from":"HH:MM","to":"HH:MM"}], ...}
 * Typed POJO for available_days deferred — using JsonNode until shape is locked.
 * consultation_fee / follow_up_fee are the source of truth for pricing (not services table).
 *
 * Note: com.hospital.management.platform.identity.profile.DoctorProfile is the
 * JSON variant for users.profile_data — a separate, unrelated class.
 */
@Entity
@Table(name = "doctor_profiles")
@Getter
public class DoctorProfile extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Setter @Column
    private String qualification;

    @Setter @Column
    private String registrationNumber;

    @Setter @Column
    private String specialization;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal consultationFee;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal followUpFee;

    @Setter @Column(nullable = false)
    private int followUpWindowDays;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode availableDays;

    @Setter @Column
    private byte[] digitalSignature;

    protected DoctorProfile() {}

    public DoctorProfile(User user, BigDecimal consultationFee, BigDecimal followUpFee,
                         int followUpWindowDays, UUID createdBy) {
        this.user               = user;
        this.consultationFee    = consultationFee;
        this.followUpFee        = followUpFee;
        this.followUpWindowDays = followUpWindowDays;
        setCreatedBy(createdBy);
    }

    public void updateAvailableDays(JsonNode schedule) {
        this.availableDays = schedule;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DoctorProfile d)) return false;
        return user != null && user.equals(d.user);
    }

    @Override
    public int hashCode() { return Objects.hash(user); }
}
