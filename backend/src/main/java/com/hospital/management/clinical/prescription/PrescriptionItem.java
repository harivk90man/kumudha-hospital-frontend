package com.hospital.management.clinical.prescription;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

/**
 * One medicine line on a prescription. CASCADE child of prescriptions.
 * medicineId FK → medicines(id) RESTRICT is added in the inventory module migration.
 * medicineNameSnapshot preserves the name at prescription time regardless of future catalogue changes.
 */
@Entity
@Table(name = "prescription_items")
@Getter
public class PrescriptionItem extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID prescriptionId;

    /** FK → medicines(id) RESTRICT — constraint added in the inventory module migration. */
    @Column(nullable = false, updatable = false)
    private UUID medicineId;

    /** Snapshot of medicine name at prescription time. */
    @Column(nullable = false, updatable = false)
    private String medicineNameSnapshot;

    @Setter @Column(nullable = false)
    private String dosage;

    @Setter @Column(nullable = false)
    private String frequency;

    @Setter @Column(nullable = false)
    private int durationDays;

    @Setter @Column
    private String instructions;

    @Setter @Column(nullable = false)
    private int quantityPrescribed;

    @Column(nullable = false, updatable = false)
    private int sequenceNo;

    protected PrescriptionItem() {}

    public PrescriptionItem(UUID prescriptionId, UUID medicineId, String medicineNameSnapshot,
                            String dosage, String frequency, int durationDays,
                            int quantityPrescribed, int sequenceNo, UUID createdBy) {
        this.prescriptionId       = prescriptionId;
        this.medicineId           = medicineId;
        this.medicineNameSnapshot = medicineNameSnapshot;
        this.dosage               = dosage;
        this.frequency            = frequency;
        this.durationDays         = durationDays;
        this.quantityPrescribed   = quantityPrescribed;
        this.sequenceNo           = sequenceNo;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PrescriptionItem i)) return false;
        return Objects.equals(prescriptionId, i.prescriptionId) && sequenceNo == i.sequenceNo;
    }

    @Override
    public int hashCode() { return Objects.hash(prescriptionId, sequenceNo); }
}
