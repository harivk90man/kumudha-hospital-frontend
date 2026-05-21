package com.hospital.management.platform.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

/**
 * Typed logging facade for business events.
 * All log statements go through here — enforces a consistent format and
 * makes it easy to add PII masking in one place when required.
 *
 * Event list is expanded as each feature is implemented.
 * Callers never use raw log.info() for business events — always call a named method here.
 */
public final class HmsLogger {

    private HmsLogger() {}

    // ── platform / identity ───────────────────────────────────────────────────

    private static final Logger AUTH = LoggerFactory.getLogger("hms.auth");

    public static void loginSuccess(String username, String ip) {
        AUTH.info("LOGIN_SUCCESS username={} ip={}", username, ip);
    }

    public static void loginFailed(String username, String ip, int failedAttempts) {
        AUTH.warn("LOGIN_FAILED username={} ip={} attempts={}", username, ip, failedAttempts);
    }

    public static void accountLocked(String username, String ip) {
        AUTH.warn("ACCOUNT_LOCKED username={} ip={}", username, ip);
    }

    public static void passwordChanged(UUID userId) {
        AUTH.info("PASSWORD_CHANGED userId={}", userId);
    }

    // ── feature loggers added here as each module is implemented ─────────────
    // patient, opd, clinical, lab, radiology, pharmacy, billing
}
