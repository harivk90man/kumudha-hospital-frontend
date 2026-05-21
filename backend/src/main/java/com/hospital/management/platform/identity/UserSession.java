package com.hospital.management.platform.identity;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Active and revoked login sessions.
 * tokenHash stores a hashed refresh token — never the raw token.
 * rotatedFromSessionId supports refresh-token rotation chain.
 * Full token blacklist implemented here when user_sessions Flyway migration lands.
 */
@Entity
@Table(name = "user_sessions")
@Getter
public class UserSession extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String tokenHash;

    @Column(nullable = false)
    private OffsetDateTime expiresAt;

    @Setter @Column
    private OffsetDateTime revokedAt;

    @Column
    private UUID rotatedFromSessionId;

    @Column
    private String ipAddress;

    @Column
    private String userAgent;

    protected UserSession() {}

    public UserSession(UUID userId, String tokenHash, OffsetDateTime expiresAt,
                       String ipAddress, String userAgent, UUID createdBy) {
        this.userId    = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
        setCreatedBy(createdBy);
    }

    public boolean isExpired() {
        return OffsetDateTime.now().isAfter(expiresAt);
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isValid() {
        return !isExpired() && !isRevoked();
    }

    public void revoke() {
        this.revokedAt = OffsetDateTime.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserSession s)) return false;
        return tokenHash != null && tokenHash.equals(s.tokenHash);
    }

    @Override
    public int hashCode() { return Objects.hash(tokenHash); }
}
