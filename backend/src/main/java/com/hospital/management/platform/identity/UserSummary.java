package com.hospital.management.platform.identity;

import java.util.UUID;

/**
 * Minimal projection used by other packages via UserQueryService.
 * Other packages hold only this — they never import the User entity directly.
 */
public record UserSummary(
        UUID   id,
        String fullName,
        String username,
        UUID   departmentId,
        String status
) {}
