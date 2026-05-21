package com.hospital.management.platform;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

public final class SecurityUtils {

    private SecurityUtils() {}

    /** Extracts the UUID principal set by JwtAuthFilter. Throws 401 if absent. */
    public static UUID requireActorId(Authentication auth) {
        if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof UUID userId) {
            return userId;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
    }
}
