package com.hospital.management.platform.identity;

import com.hospital.management.platform.logging.HmsLogger;
import com.hospital.management.platform.rbac.UserRole;
import com.hospital.management.platform.rbac.UserRoleRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class AuthService {

    private final UserService        userService;
    private final UserRoleRepository userRoleRepository;
    private final JwtService         jwtService;
    private final PasswordEncoder    passwordEncoder;

    @Value("${hms.auth.max-failed-attempts:5}")
    private int maxFailedAttempts;

    @Value("${hms.auth.lockout-minutes:30}")
    private int lockoutMinutes;

    public AuthService(UserService userService,
                       UserRoleRepository userRoleRepository,
                       JwtService jwtService,
                       PasswordEncoder passwordEncoder) {
        this.userService        = userService;
        this.userRoleRepository = userRoleRepository;
        this.jwtService         = jwtService;
        this.passwordEncoder    = passwordEncoder;
    }

    /** Credential login: validate username + password, issue a new token. */
    public LoginResponse login(LoginRequest req, String ip, String userAgent) {
        User user = userService.requireByUsername(req.username());

        if (user.isDeleted()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account is not active");
        }
        if (user.isLocked()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account is temporarily locked");
        }

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            user.recordLoginFailure(maxFailedAttempts, lockoutMinutes);
            HmsLogger.loginFailed(req.username(), ip, user.getFailedAttempts());
            if (user.isLocked()) {
                HmsLogger.accountLocked(req.username(), ip);
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }

        user.recordLoginSuccess(ip, userAgent);
        HmsLogger.loginSuccess(req.username(), ip);

        String token = jwtService.generateToken(user);
        return new LoginResponse(token, jwtService.expiryTime(), buildLoginDto(user));
    }

    /**
     * Token revalidation: verify the existing JWT, reload the user from DB, and return
     * the same response shape. The original token is returned as-is — expiry is not
     * extended so the client sees the remaining window correctly.
     */
    @Transactional(readOnly = true)
    public LoginResponse loginWithToken(String token, String ip, String userAgent) {
        UUID userId;
        try {
            userId = jwtService.extractUserId(token);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }

        User user = userService.requireById(userId);

        if (user.isDeleted() || user.getStatus() != UserStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account is not active");
        }
        if (user.isLocked()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account is temporarily locked");
        }
        if (jwtService.extractTokenVersion(token) != user.getTokenVersion()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token has been invalidated");
        }

        return new LoginResponse(token, jwtService.expiryTimeFromToken(token), buildLoginDto(user));
    }

    public void logout(String token) {
        try {
            UUID userId = jwtService.extractUserId(token);
            userService.invalidateTokens(userId);
        } catch (Exception ignored) {
            // Invalid token on logout is not an error — session is already gone client-side.
        }
    }

    private LoginUserDto buildLoginDto(User user) {
        List<UserRole> activeRoles = userRoleRepository.findByIdUserId(user.getId());

        String primaryRole = activeRoles.stream()
                .filter(UserRole::isPrimary)
                .findFirst()
                .map(ur -> ur.getRole().getRoleCode())
                .orElse(null);

        List<String> allRoles = activeRoles.stream()
                .map(ur -> ur.getRole().getRoleCode())
                .toList();

        return UserMapper.toLoginDto(user, primaryRole, allRoles);
    }
}
