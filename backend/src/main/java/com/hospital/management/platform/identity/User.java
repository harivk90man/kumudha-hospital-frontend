package com.hospital.management.platform.identity;

import com.hospital.management.platform.audit.AuditableEntity;
import com.hospital.management.platform.identity.profile.ProfileData;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Every staff account in one row — auth + HR.
 * Doctor-specific extensions (fees, schedule) live in doctor_profiles (01B).
 *
 * Business key: username (stable, unique, never null after construction).
 * department_id is a raw UUID until the Department entity is created (01B).
 *
 * profile_data is jsonb polymorphic via ProfileData sealed interface.
 * Hibernate @Version owns optimistic locking — fn_touch_updated() trigger
 * must NOT increment version (only updated_at).
 */
@Entity
@Table(name = "users")
@Getter
public class User extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    // ── HR identity ──────────────────────────────────────────────────────────

    @Column(nullable = false, unique = true)
    private String employeeId;

    @Setter
    @Column(nullable = false)
    private String fullName;

    /** Raw UUID until Department entity exists (Module 01B). Replace with @ManyToOne then. */
    @Column
    private UUID departmentId;

    @Setter
    private String designation;

    @Setter
    private LocalDate joiningDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private ProfileData profileData;

    // ── Auth — login identifiers ─────────────────────────────────────────────

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false, unique = true)
    private String mobile;

    /** Partial unique index (WHERE deleted_at IS NULL) is in the Flyway migration — not @Column(unique). */
    @Setter
    @Column
    private String email;

    // ── Auth — credentials & security state ──────────────────────────────────

    @Setter
    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private OffsetDateTime passwordChangedAt;

    @Setter
    @Column(nullable = false)
    private boolean mustChangePassword;

    @Column(nullable = false)
    private int failedAttempts;

    @Setter
    @Column
    private OffsetDateTime lockedUntil;

    @Setter
    @Column(nullable = false)
    private boolean mfaEnabled;

    @Column(nullable = false)
    private int tokenVersion;

    /** Incremented on logout — invalidates all previously issued JWTs for this user. */
    public void invalidateTokens() { this.tokenVersion++; }

    @Setter
    @Column
    private String mfaSecret;

    @Convert(converter = UserStatusConverter.class)
    @Column(nullable = false)
    private UserStatus status;

    @Setter
    @Column
    private byte[] profilePicture;

    // ── Telemetry ─────────────────────────────────────────────────────────────

    @Setter
    @Column
    private OffsetDateTime lastLoginAt;

    @Setter
    @Column
    private String lastLoginIp;

    @Setter
    @Column
    private String lastLoginUserAgent;

    @Setter
    @Column
    private String notes;

    protected User() {
        // JPA proxy constructor
    }

    public User(String employeeId,
                String fullName,
                String username,
                String mobile,
                String passwordHash,
                ProfileData profileData,
                UUID createdBy) {
        this.employeeId           = employeeId;
        this.fullName             = fullName;
        this.username             = username;
        this.mobile               = mobile;
        this.passwordHash         = passwordHash;
        this.profileData          = profileData;
        this.status               = UserStatus.ACTIVE;
        this.mustChangePassword   = true;
        this.mfaEnabled           = false;
        this.failedAttempts       = 0;
        this.passwordChangedAt    = OffsetDateTime.now();
        setCreatedBy(createdBy);
    }

    // ── Mutating business methods ─────────────────────────────────────────────

    public void recordLoginSuccess(String ip, String userAgent) {
        this.lastLoginAt        = OffsetDateTime.now();
        this.lastLoginIp        = ip;
        this.lastLoginUserAgent = userAgent;
        this.failedAttempts     = 0;
        this.lockedUntil        = null;
    }

    public void recordLoginFailure(int maxAttempts, int lockMinutes) {
        this.failedAttempts++;
        if (this.failedAttempts >= maxAttempts) {
            this.lockedUntil = OffsetDateTime.now().plusMinutes(lockMinutes);
        }
    }

    public boolean isLocked() {
        return lockedUntil != null && OffsetDateTime.now().isBefore(lockedUntil);
    }

    public void changePassword(String newHash) {
        this.passwordHash          = newHash;
        this.passwordChangedAt     = OffsetDateTime.now();
        this.mustChangePassword    = false;
    }

    public void activate()  { this.status = UserStatus.ACTIVE; }
    public void deactivate() { this.status = UserStatus.INACTIVE; }
    public void suspend()    { this.status = UserStatus.SUSPENDED; }

    public void updateProfile(ProfileData profileData) {
        this.profileData = profileData;
    }

    public void assignDepartment(UUID departmentId) {
        this.departmentId = departmentId;
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User u)) return false;
        return username != null && username.equals(u.username);
    }

    @Override
    public int hashCode() {
        return Objects.hash(username);
    }

    @Override
    public String toString() {
        return "User[id=" + id + ", username=" + username + ", status=" + status + "]";
    }
}
