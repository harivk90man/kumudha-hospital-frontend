package com.hospital.management.platform.identity.profile;

import java.util.List;

/** JSON variant for users.profile_data — not the doctor_profiles JPA entity. */
public record DoctorProfile(List<String> languages) implements ProfileData {
}
