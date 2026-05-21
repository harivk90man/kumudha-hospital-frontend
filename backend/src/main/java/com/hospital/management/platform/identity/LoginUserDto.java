package com.hospital.management.platform.identity;

import com.hospital.management.platform.identity.profile.ProfileData;

import java.util.List;
import java.util.UUID;

/**
 * Full user record returned in the login response.
 * Contains every field the UI needs to bootstrap a session —
 * primary role (for portal routing), all active roles (for permission checks),
 * profile data (role-specific fields like specialization, stationSlug),
 * and profile picture as base64 string (null when not set).
 * Password hash and security internals are deliberately excluded.
 */
public record LoginUserDto(
        UUID         id,
        String       employeeId,
        String       fullName,
        String       username,
        String       email,
        String       mobile,
        UUID         departmentId,
        String       designation,
        String       primaryRole,
        List<String> allRoles,
        ProfileData  profileData,
        String       profilePicture,
        String       status,
        boolean      mustChangePassword,
        boolean      mfaEnabled
) {}
