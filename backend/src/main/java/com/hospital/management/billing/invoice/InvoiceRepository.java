package com.hospital.management.billing.invoice;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    Optional<Invoice> findByInvoiceNumberAndDeletedAtIsNull(String invoiceNumber);

    Optional<Invoice> findByIdempotencyKeyAndDeletedAtIsNull(UUID idempotencyKey);

    List<Invoice> findByPatientIdAndDeletedAtIsNullOrderByInvoiceDateDesc(UUID patientId);

    List<Invoice> findByOpVisitIdAndDeletedAtIsNull(UUID opVisitId);

    List<Invoice> findByPaymentStatusAndDeletedAtIsNull(String paymentStatus);

    /** Outstanding invoices — balance > 0 and not cancelled. */
    List<Invoice> findByPaymentStatusNotInAndDeletedAtIsNull(List<String> excludedStatuses);
}
