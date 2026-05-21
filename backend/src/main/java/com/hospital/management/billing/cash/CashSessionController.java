package com.hospital.management.billing.cash;

import com.hospital.management.platform.SecurityUtils;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;

/**
 * Cash session lifecycle:
 *
 *   POST /api/cash-sessions/open    → cashier opens a shift at a counter
 *   GET  /api/cash-sessions/current → find the calling cashier's open session
 */
@RestController
@RequestMapping("/api/cash-sessions")
public class CashSessionController {

    private final CashSessionService service;

    public CashSessionController(CashSessionService service) {
        this.service = service;
    }

    @PostMapping("/open")
    @ResponseStatus(HttpStatus.CREATED)
    public CashSession open(@Valid @RequestBody OpenSessionRequest req,
                            Authentication auth) {
        return service.openSession(req, SecurityUtils.requireActorId(auth));
    }

    @GetMapping("/current")
    public CashSession current(Authentication auth) {
        return service.currentSession(SecurityUtils.requireActorId(auth));
    }
}
