package com.hospital.management.inventory.narcotic;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Transactional(readOnly = true)
public interface NarcoticRegisterRepository extends JpaRepository<NarcoticRegister, UUID> {

    List<NarcoticRegister> findByDrugIdOrderByCreatedAtDesc(UUID drugId);

    List<NarcoticRegister> findByTransactionTypeAndApprovalStatus(String transactionType, String approvalStatus);

    List<NarcoticRegister> findByPrescriptionId(UUID prescriptionId);
}
