package com.hospital.management.lab.catalogue;

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
 * Lab test panel (bundle of related tests) — e.g. LFT, CBC, Lipid Profile.
 * serviceId FK to services(id) added in pricing module migration.
 * Items in the panel are in lab_test_group_items.
 */
@Entity
@Table(name = "lab_test_groups")
@Getter
public class LabTestGroup extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String panelCode;

    @Setter @Column(nullable = false)
    private String panelName;

    /** FK → services(id) RESTRICT — constraint added in pricing module migration. */
    @Column(nullable = false)
    private UUID serviceId;

    @Setter @Column
    private String description;

    protected LabTestGroup() {}

    public LabTestGroup(String panelCode, String panelName, UUID serviceId, UUID createdBy) {
        this.panelCode = panelCode;
        this.panelName = panelName;
        this.serviceId = serviceId;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof LabTestGroup g)) return false;
        return panelCode != null && panelCode.equals(g.panelCode);
    }

    @Override
    public int hashCode() { return Objects.hash(panelCode); }
}
