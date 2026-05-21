package com.hospital.management.billing.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation, UUID> {

    List<PaymentAllocation> findByPaymentId(UUID paymentId);

    List<PaymentAllocation> findByInvoiceId(UUID invoiceId);

    List<PaymentAllocation> findByPharmacySaleId(UUID pharmacySaleId);
}
