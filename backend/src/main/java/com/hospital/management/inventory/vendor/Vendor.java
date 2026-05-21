package com.hospital.management.inventory.vendor;

import com.fasterxml.jackson.databind.JsonNode;
import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.util.Objects;
import java.util.UUID;

/**
 * Medicine supplier/vendor master.
 * is_narcotic_supplier = true is required before a purchase order can include narcotic drugs.
 */
@Entity
@Table(name = "vendors")
@Getter
public class Vendor extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String vendorCode;

    @Setter @Column(nullable = false)
    private String vendorName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Setter @Column(columnDefinition = "jsonb")
    private JsonNode address;

    @Setter @Column
    private String gstin;

    @Setter @Column
    private String pan;

    @Setter @Column
    private String drugLicenceNumber;

    @Setter @Column(nullable = false)
    private int paymentTermsDays;

    @Setter @Column(nullable = false)
    private boolean isNarcoticSupplier;

    protected Vendor() {}

    public Vendor(String vendorCode, String vendorName, int paymentTermsDays, UUID createdBy) {
        this.vendorCode         = vendorCode;
        this.vendorName         = vendorName;
        this.paymentTermsDays   = paymentTermsDays;
        this.isNarcoticSupplier = false;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Vendor v)) return false;
        return vendorCode != null && vendorCode.equals(v.vendorCode);
    }

    @Override
    public int hashCode() { return Objects.hash(vendorCode); }
}
