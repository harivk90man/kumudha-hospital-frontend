package com.hospital.management.billing.pricing;

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
 * Hospital service catalogue. Referenced by lab_tests, lab_test_groups,
 * radiology_procedures for billing association.
 *
 * Changing defaultPrice triggers fn_services_price_history() DB trigger which
 * closes the current open service_price_history row and inserts a new one.
 * Never manually insert/update service_price_history from the application.
 *
 * service_type: lab_test | lab_panel | radiology | medicine | procedure |
 *               room_charge | nursing | consumable | ambulance | other
 */
@Entity
@Table(name = "services")
@Getter
public class Service extends AuditableEntity {

    @Id
    @UuidGenerator(style = UuidGenerator.Style.TIME)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, updatable = false)
    private String serviceCode;

    @Setter @Column(nullable = false)
    private String serviceName;

    @Column(nullable = false, updatable = false)
    private String serviceType;

    @Setter @Column
    private UUID departmentId;

    @Setter @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal defaultPrice;

    @Setter @Column(nullable = false)
    private boolean isTaxable;

    @Setter @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal defaultGstPct;

    @Setter @Column
    private String sacCode;

    @Setter @Column
    private String description;

    protected Service() {}

    public Service(String serviceCode, String serviceName, String serviceType,
                   BigDecimal defaultPrice, UUID createdBy) {
        this.serviceCode   = serviceCode;
        this.serviceName   = serviceName;
        this.serviceType   = serviceType;
        this.defaultPrice  = defaultPrice;
        this.isTaxable     = false;
        this.defaultGstPct = BigDecimal.ZERO;
        setCreatedBy(createdBy);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Service s)) return false;
        return serviceCode != null && serviceCode.equals(s.serviceCode);
    }

    @Override
    public int hashCode() { return Objects.hash(serviceCode); }
}
