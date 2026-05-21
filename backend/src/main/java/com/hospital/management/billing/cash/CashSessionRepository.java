package com.hospital.management.billing.cash;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface CashSessionRepository extends JpaRepository<CashSession, UUID> {

    Optional<CashSession> findBySessionNumberAndDeletedAtIsNull(String sessionNumber);

    /** Active session for a counter — at most one should be open. */
    Optional<CashSession> findByCounterIdAndStatusInAndDeletedAtIsNull(UUID counterId, List<String> statuses);

    List<CashSession> findByBusinessDateAndDeletedAtIsNull(LocalDate businessDate);

    List<CashSession> findByOpenedByAndDeletedAtIsNullOrderByOpenedAtDesc(UUID openedBy);

    /** The cashier's current open session — at most one due to uq_cash_sessions_cashier_active index. */
    Optional<CashSession> findByOpenedByAndStatusAndDeletedAtIsNull(UUID openedBy, String status);
}
