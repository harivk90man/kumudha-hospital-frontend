package com.hospital.management.platform.identity;

import com.hospital.management.platform.identity.profile.ProfileData;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public record UpdateUserRequest(

        @NotBlank
        String fullName,

        String email,

        UUID departmentId,

        String designation,

        LocalDate joiningDate,

        ProfileData profileData,

        String notes
) {}
