package com.hospital.management.platform.identity;

import java.time.OffsetDateTime;

public record LoginResponse(
        String        token,
        OffsetDateTime expiresAt,
        LoginUserDto  user
) {}
