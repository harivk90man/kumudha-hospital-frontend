package com.hospital.management.platform.identity;

import com.hospital.management.platform.identity.profile.ProfileData;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Full user representation returned by the API.
 * Sensitive fields intentionally excluded: passwordHash, mfaSecret,
 * failedAttempts, lockedUntil.
 */
public record UserResponse(
        UUID           id,
        String         employeeId,
        String         fullName,
        String         username,
        String         mobile,
        String         email,
        UUID           departmentId,
        String         designation,
        LocalDate      joiningDate,
        ProfileData    profileData,
        String         status,
        boolean        mfaEnabled,
        boolean        mustChangePassword,
        OffsetDateTime lastLoginAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        int            version
) {}
