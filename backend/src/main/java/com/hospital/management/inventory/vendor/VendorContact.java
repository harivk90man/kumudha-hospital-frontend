package com.hospital.management.inventory.vendor;

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
 * Contact person for a vendor. CASCADE child of vendors.
 * At most one contact per vendor may have is_primary = true (partial unique index in DB).
 * At least one of mobile, phone, email must be non-NULL (chk_vendor_contacts_has_contact).
 */
@Entity
@Table(name = "vendor_contacts")
@Getter
public class VendorContact extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID vendorId;

    @Setter @Column(nullable = false)
    private String contactName;

    @Setter @Column(nullable = false)
    private String role;

    @Setter @Column
    private String mobile;

    @Setter @Column
    private String phone;

    @Setter @Column
    private String email;

    @Setter @Column(nullable = false)
    private boolean isPrimary;

    protected VendorContact() {}

    public VendorContact(UUID vendorId, String contactName, String role,
                         String mobile, String email, UUID createdBy) {
        this.vendorId    = vendorId;
        this.contactName = contactName;
        this.role        = role;
        this.mobile      = mobile;
        this.email       = email;
        this.isPrimary   = false;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof VendorContact c)) return false;
        return Objects.equals(id, c.id);
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
