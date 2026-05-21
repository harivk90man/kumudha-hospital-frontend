package com.hospital.management.inventory.narcotic;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * NDPS-mandated narcotic movement register. Append-only with 7-year legal retention.
 *
 * Two-person rule: performedBy ≠ witnessedBy (enforced by DB CHECK).
 * quantityBefore is auto-set by fn_narcotic_register_validate() BEFORE INSERT trigger
 * from the last row for this drug — app must NOT set this field.
 * quantityAfter is the new balance after the transaction — set by app.
 *
 * L2 approval applies only to wastage and adjustment transactions.
 * Forward FKs: pharmacySaleId → pharmacy_sales(id) added in Module 15.
 */
@Entity
@Table(name = "narcotic_register")
@Getter
public class NarcoticRegister {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID drugId;

    @Column(updatable = false)
    private UUID drugStockId;

    @Column(nullable = false, updatable = false)
    private String transactionType;

    /** Auto-set by BEFORE INSERT trigger from the previous row. App must not set this. */
    @Column(nullable = false, insertable = false, updatable = false)
    private int quantityBefore;

    @Column(nullable = false, updatable = false)
    private int quantityAfter;

    /** FK → pharmacy_sales(id) RESTRICT — constraint added in pharmacy module migration. */
    @Column(updatable = false)
    private UUID pharmacySaleId;

    @Column(updatable = false)
    private UUID prescriptionId;

    @Column(updatable = false)
    private String prescriberName;

    @Column(updatable = false)
    private String prescriberRegNo;

    @Column(updatable = false)
    private String recipientName;

    @Column(updatable = false)
    private String recipientRelation;

    @Column(updatable = false)
    private String recipientIdProof;

    @Column(nullable = false, updatable = false)
    private UUID performedBy;

    @Column(nullable = false, updatable = false)
    private UUID witnessedBy;

    @Column(updatable = false)
    private String notes;

    // ── L2 maker-checker (wastage / adjustment only) ──────────────────────

    @Column(nullable = false)
    private String approvalStatus;

    @Column
    private UUID approvedBy;

    @Column
    private OffsetDateTime approvedAt;

    @Column
    private String rejectionReason;

    // ── Append-only audit ─────────────────────────────────────────────────

    @Column(updatable = false, nullable = false)
    private UUID createdBy;

    @Column(updatable = false, nullable = false)
    private OffsetDateTime createdAt;

    @Version
    @Column(nullable = false)
    private int version;

    @PrePersist
    protected void onInsert() { createdAt = OffsetDateTime.now(); }

    protected NarcoticRegister() {}

    public NarcoticRegister(UUID drugId, UUID drugStockId, String transactionType,
                            int quantityAfter, UUID pharmacySaleId, UUID prescriptionId,
                            String prescriberName, String prescriberRegNo,
                            String recipientName, String recipientRelation, String recipientIdProof,
                            UUID performedBy, UUID witnessedBy, String notes,
                            UUID createdBy) {
        this.drugId           = drugId;
        this.drugStockId      = drugStockId;
        this.transactionType  = transactionType;
        this.quantityAfter    = quantityAfter;
        this.pharmacySaleId   = pharmacySaleId;
        this.prescriptionId   = prescriptionId;
        this.prescriberName   = prescriberName;
        this.prescriberRegNo  = prescriberRegNo;
        this.recipientName    = recipientName;
        this.recipientRelation = recipientRelation;
        this.recipientIdProof = recipientIdProof;
        this.performedBy      = performedBy;
        this.witnessedBy      = witnessedBy;
        this.notes            = notes;
        this.approvalStatus   = "approved";
        this.createdBy        = createdBy;
    }

    public void approve(UUID approver) {
        this.approvalStatus = "approved";
        this.approvedBy     = approver;
        this.approvedAt     = OffsetDateTime.now();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof NarcoticRegister n)) return false;
        return Objects.equals(id, n.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
