package com.hospital.management.inventory.drug;

import com.hospital.management.platform.audit.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;

/**
 * Medicine master catalogue. Referenced by prescription_items.medicine_id.
 * drug_schedule H/H1/X = controlled substances requiring special handling.
 * is_narcotic = true triggers NDPS narcotic_register entry on dispense.
 * gst_pct must be one of the GST rate buckets: 0, 5, 12, 18, 28.
 */
@Entity
@Table(name = "drug_catalogue")
@Getter
public class DrugCatalogue extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String drugCode;

    @Setter @Column(nullable = false)
    private String genericName;

    @Setter @Column
    private String brandName;

    @Setter @Column
    private String manufacturer;

    @Setter @Column
    private String drugClass;

    @Setter @Column
    private String category;

    /** H | H1 | X | G | OTC | NULL */
    @Setter @Column
    private String drugSchedule;

    @Setter @Column(nullable = false)
    private boolean isNarcotic;

    /** tablet | capsule | syrup | injection | cream | ointment | drops | inhaler | patch | suppository | powder | other */
    @Setter @Column(nullable = false)
    private String form;

    @Setter @Column
    private String strength;

    @Setter @Column(nullable = false)
    private String unit;

    @Setter @Column(nullable = false)
    private int packSize;

    @Setter @Column
    private String hsnCode;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal gstPct;

    @Setter @Column(nullable = false)
    private boolean requiresPrescription;

    @Setter @Column(nullable = false)
    private int lowStockThreshold;

    @Setter @Column(nullable = false)
    private int maxStockThreshold;

    /** room | refrigerated | frozen | controlled */
    @Setter @Column
    private String storageTemp;

    protected DrugCatalogue() {}

    public DrugCatalogue(String drugCode, String genericName, String form,
                         String unit, BigDecimal gstPct, UUID createdBy) {
        this.drugCode             = drugCode;
        this.genericName          = genericName;
        this.form                 = form;
        this.unit                 = unit;
        this.packSize             = 1;
        this.gstPct               = gstPct;
        this.isNarcotic           = false;
        this.requiresPrescription = true;
        this.lowStockThreshold    = 0;
        this.maxStockThreshold    = 0;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DrugCatalogue d)) return false;
        return drugCode != null && drugCode.equals(d.drugCode);
    }

    @Override
    public int hashCode() { return Objects.hash(drugCode); }
}
