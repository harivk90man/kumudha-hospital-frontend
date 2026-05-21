package com.hospital.management.billing.cash;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface CashCounterRepository extends JpaRepository<CashCounter, UUID> {

    Optional<CashCounter> findByCounterCodeAndDeletedAtIsNull(String counterCode);

    List<CashCounter> findByDeletedAtIsNull();
}
