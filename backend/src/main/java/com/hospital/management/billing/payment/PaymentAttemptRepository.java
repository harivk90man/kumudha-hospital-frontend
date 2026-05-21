package com.hospital.management.billing.payment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PaymentAttemptRepository extends JpaRepository<PaymentAttempt, UUID> {

    /** In-flight attempt for an appointment. At most one due to partial unique index. */
    Optional<PaymentAttempt> findByAppointmentIdAndStatus(UUID appointmentId, String status);

    /** In-flight attempt for a lab order. At most one due to partial unique index. */
    Optional<PaymentAttempt> findByLabOrderIdAndStatus(UUID labOrderId, String status);

    /** In-flight attempt for a radiology order. At most one due to partial unique index. */
    Optional<PaymentAttempt> findByRadiologyOrderIdAndStatus(UUID radiologyOrderId, String status);

    /** In-flight attempt for a pharmacy sale. At most one due to partial unique index. */
    Optional<PaymentAttempt> findByPharmacySaleIdAndStatus(UUID pharmacySaleId, String status);

    /**
     * Look up by gateway idempotency key — used on timeout retry to find the
     * existing attempt and re-send the same key rather than starting a new charge.
     */
    Optional<PaymentAttempt> findByGatewayIdempotencyKey(UUID gatewayIdempotencyKey);
}
