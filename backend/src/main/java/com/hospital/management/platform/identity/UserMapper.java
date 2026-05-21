package com.hospital.management.platform.identity;

import java.util.Base64;
import java.util.List;

public final class UserMapper {

    private UserMapper() {}

    public static UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmployeeId(),
                user.getFullName(),
                user.getUsername(),
                user.getMobile(),
                user.getEmail(),
                user.getDepartmentId(),
                user.getDesignation(),
                user.getJoiningDate(),
                user.getProfileData(),
                user.getStatus().dbValue(),
                user.isMfaEnabled(),
                user.isMustChangePassword(),
                user.getLastLoginAt(),
                user.getCreatedAt(),
                user.getUpdatedAt(),
                user.getVersion()
        );
    }

    public static UserSummary toSummary(User user) {
        return new UserSummary(
                user.getId(),
                user.getFullName(),
                user.getUsername(),
                user.getDepartmentId(),
                user.getStatus().dbValue()
        );
    }

    public static LoginUserDto toLoginDto(User user, String primaryRole, List<String> allRoles) {
        String profilePicBase64 = user.getProfilePicture() != null
                ? Base64.getEncoder().encodeToString(user.getProfilePicture())
                : null;

        return new LoginUserDto(
                user.getId(),
                user.getEmployeeId(),
                user.getFullName(),
                user.getUsername(),
                user.getEmail(),
                user.getMobile(),
                user.getDepartmentId(),
                user.getDesignation(),
                primaryRole,
                allRoles,
                user.getProfileData(),
                profilePicBase64,
                user.getStatus().dbValue(),
                user.isMustChangePassword(),
                user.isMfaEnabled()
        );
    }
}
