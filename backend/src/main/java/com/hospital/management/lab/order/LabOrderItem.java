package com.hospital.management.lab.order;

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
 * One test line on a lab order. CASCADE child of lab_orders.
 * sampleId is set once the physical specimen is linked to this test line.
 * groupId is non-NULL when the test was ordered as part of a panel.
 */
@Entity
@Table(name = "lab_order_items")
@Getter
public class LabOrderItem extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID labOrderId;

    @Column(nullable = false, updatable = false)
    private UUID labTestId;

    /** Set when this item was ordered as part of a panel. */
    @Column(updatable = false)
    private UUID groupId;

    /** Linked once the physical specimen is collected and assigned. */
    @Setter @Column
    private UUID sampleId;

    @Setter @Column(nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private int sequenceNo;

    protected LabOrderItem() {}

    public LabOrderItem(UUID labOrderId, UUID labTestId, UUID groupId,
                        int sequenceNo, UUID createdBy) {
        this.labOrderId = labOrderId;
        this.labTestId  = labTestId;
        this.groupId    = groupId;
        this.sequenceNo = sequenceNo;
        this.status     = "pending";
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabOrderItem i)) return false;
        return Objects.equals(labOrderId, i.labOrderId) && Objects.equals(labTestId, i.labTestId);
    }

    @Override
    public int hashCode() { return Objects.hash(labOrderId, labTestId); }
}
