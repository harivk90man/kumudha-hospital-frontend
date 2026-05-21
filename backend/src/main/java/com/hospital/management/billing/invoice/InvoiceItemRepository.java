package com.hospital.management.billing.invoice;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, UUID> {

    List<InvoiceItem> findByInvoiceIdOrderBySequenceNo(UUID invoiceId);

    Optional<InvoiceItem> findByConsultationId(UUID consultationId);

    Optional<InvoiceItem> findByLabOrderItemId(UUID labOrderItemId);

    Optional<InvoiceItem> findByRadiologyOrderId(UUID radiologyOrderId);

    Optional<InvoiceItem> findByPharmacySaleItemId(UUID pharmacySaleItemId);
}
