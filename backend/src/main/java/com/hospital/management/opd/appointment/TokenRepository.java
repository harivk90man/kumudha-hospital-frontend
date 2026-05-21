package com.hospital.management.opd.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface TokenRepository extends JpaRepository<Token, UUID> {

    /** Live queue for a provider (doctor) on a given date. */
    List<Token> findByServiceTypeAndProviderIdAndIssueDateAndStatusInAndDeletedAtIsNull(
            String serviceType, UUID providerId, LocalDate issueDate, List<String> statuses);

    /** Live queue for a shared service (no provider) on a given date. */
    List<Token> findByServiceTypeAndProviderIdIsNullAndIssueDateAndStatusInAndDeletedAtIsNull(
            String serviceType, LocalDate issueDate, List<String> statuses);

    Optional<Token> findByOpVisitIdAndDeletedAtIsNull(UUID opVisitId);

    /** Max sequence for the day — used to generate the next token number. */
    Optional<Integer> findTopTokenSequenceByServiceTypeAndProviderIdAndIssueDateAndDeletedAtIsNull(
            String serviceType, UUID providerId, LocalDate issueDate);
}
