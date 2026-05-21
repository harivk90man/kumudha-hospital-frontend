package com.hospital.management.billing.pricing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface ServicePriceHistoryRepository extends JpaRepository<ServicePriceHistory, UUID> {

    /** Current/active price for a service — the open row (effectiveTo IS NULL). */
    Optional<ServicePriceHistory> findByServiceIdAndEffectiveToIsNullAndDeletedAtIsNull(UUID serviceId);

    List<ServicePriceHistory> findByServiceIdAndDeletedAtIsNullOrderByEffectiveFromDesc(UUID serviceId);

    /** Price effective on a specific date — for historical billing reconstruction. */
    Optional<ServicePriceHistory> findByServiceIdAndEffectiveFromLessThanEqualAndEffectiveToGreaterThanAndDeletedAtIsNull(
            UUID serviceId, LocalDate date, LocalDate date2);
}
