package com.hospital.management.platform.identity.profile;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = AdminProfile.class,          name = "admin"),
    @JsonSubTypes.Type(value = DoctorProfile.class,         name = "doctor"),
    @JsonSubTypes.Type(value = NurseProfile.class,          name = "nurse"),
    @JsonSubTypes.Type(value = ReceptionistProfile.class,   name = "receptionist"),
    @JsonSubTypes.Type(value = CashierProfile.class,        name = "cashier"),
    @JsonSubTypes.Type(value = PharmacistProfile.class,     name = "pharmacist"),
    @JsonSubTypes.Type(value = LabTechProfile.class,        name = "lab_technician"),
    @JsonSubTypes.Type(value = RadiologyTechProfile.class,  name = "radiology_technician"),
    @JsonSubTypes.Type(value = InventoryClerkProfile.class, name = "inventory_clerk"),
    @JsonSubTypes.Type(value = OwnerProfile.class,          name = "owner"),
})
@JsonIgnoreProperties(ignoreUnknown = true)
public sealed interface ProfileData
    permits AdminProfile, DoctorProfile, NurseProfile, ReceptionistProfile,
            CashierProfile, PharmacistProfile, LabTechProfile, RadiologyTechProfile,
            InventoryClerkProfile, OwnerProfile {
}
