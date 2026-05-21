package com.hospital.management.lab.catalogue;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

import java.util.Objects;
import java.util.UUID;

/**
 * One test within a panel. CASCADE child of lab_test_groups.
 * sequenceNo controls print/display order on reports.
 */
@Entity
@Table(name = "lab_test_group_items")
@Getter
public class LabTestGroupItem extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID groupId;

    @Column(nullable = false, updatable = false)
    private UUID labTestId;

    @Column(nullable = false, updatable = false)
    private int sequenceNo;

    protected LabTestGroupItem() {}

    public LabTestGroupItem(UUID groupId, UUID labTestId, int sequenceNo, UUID createdBy) {
        this.groupId    = groupId;
        this.labTestId  = labTestId;
        this.sequenceNo = sequenceNo;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabTestGroupItem i)) return false;
        return Objects.equals(groupId, i.groupId) && Objects.equals(labTestId, i.labTestId);
    }

    @Override
    public int hashCode() { return Objects.hash(groupId, labTestId); }
}
