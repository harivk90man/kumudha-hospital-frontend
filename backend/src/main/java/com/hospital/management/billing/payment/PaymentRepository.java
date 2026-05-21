package com.hospital.management.billing.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByIdempotencyKeyAndDeletedAtIsNull(UUID idempotencyKey);

    List<Payment> findByPatientIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID patientId);

    List<Payment> findByCashSessionIdAndDeletedAtIsNull(UUID cashSessionId);

    List<Payment> findByPaymentDirectionAndDeletedAtIsNull(String paymentDirection);
}
