package com.hospital.management.billing.cash;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
@Transactional
public class CashSessionService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final CashSessionRepository cashSessionRepository;
    private final CashCounterRepository counterRepository;

    public CashSessionService(CashSessionRepository cashSessionRepository,
                              CashCounterRepository counterRepository) {
        this.cashSessionRepository = cashSessionRepository;
        this.counterRepository     = counterRepository;
    }

    // ── Open session ──────────────────────────────────────────────────────

    public CashSession openSession(OpenSessionRequest req, UUID actorId) {
        // uq_cash_sessions_cashier_active will reject a second INSERT if already open,
        // but we give a readable 409 here so the UI shows a clear message.
        cashSessionRepository.findByOpenedByAndStatusAndDeletedAtIsNull(actorId, "open")
                .ifPresent(s -> { throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "You already have an open session: " + s.getSessionNumber() +
                        ". Close it before opening another."); });

        CashCounter counter = counterRepository.findById(req.counterId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Counter not found: " + req.counterId()));

        String sessionNumber = counter.getCounterCode() + "-" +
                               LocalDate.now().format(DATE_FMT) + "-" +
                               System.currentTimeMillis() % 100000;

        CashSession session = new CashSession(
                req.counterId(), sessionNumber, req.sessionLabel(),
                LocalDate.now(), actorId, req.openingFloat(), actorId);

        return cashSessionRepository.save(session);
    }

    // ── Require open session (used by pay endpoint) ───────────────────────

    @Transactional(readOnly = true)
    public CashSession requireOpenSession(UUID cashierId) {
        return cashSessionRepository
                .findByOpenedByAndStatusAndDeletedAtIsNull(cashierId, "open")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "No open cash session. Open a session at a counter before processing payments."));
    }

    // ── Current session (read-only) ───────────────────────────────────────

    @Transactional(readOnly = true)
    public CashSession currentSession(UUID cashierId) {
        return cashSessionRepository
                .findByOpenedByAndStatusAndDeletedAtIsNull(cashierId, "open")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No open cash session for this cashier."));
    }

}
