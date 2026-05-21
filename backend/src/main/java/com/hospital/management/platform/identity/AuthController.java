package com.hospital.management.platform.identity;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Single login endpoint — handles two scenarios:
     *
     * Scenario A (fresh login): no Authorization header, body = { "username": "...", "password": "..." }
     *   → validates credentials, issues new JWT, returns full user profile.
     *
     * Scenario B (page refresh / token revalidation): Authorization: Bearer <token>, no body needed
     *   → validates token, reloads user from DB, returns same token with remaining expiry.
     *
     * Both return the same LoginResponse shape so the frontend uses one call for both.
     */
    @PostMapping("/login")
    public LoginResponse login(
            @RequestBody(required = false) LoginRequest req,
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            HttpServletRequest httpRequest) {

        String ip        = httpRequest.getRemoteAddr();
        String userAgent = httpRequest.getHeader("User-Agent");

        // Scenario B: existing token revalidation
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authService.loginWithToken(authHeader.substring(7), ip, userAgent);
        }

        // Scenario A: credential login
        if (req == null || isBlank(req.username()) || isBlank(req.password())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "username and password are required when no Authorization header is provided");
        }
        return authService.login(req, ip, userAgent);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            authService.logout(authHeader.substring(7));
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
