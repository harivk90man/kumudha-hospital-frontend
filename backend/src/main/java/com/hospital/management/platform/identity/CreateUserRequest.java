package com.hospital.management.platform.identity;

import com.hospital.management.platform.identity.profile.ProfileData;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

public record CreateUserRequest(

        @NotBlank
        String employeeId,

        @NotBlank
        String fullName,

        @NotBlank @Size(min = 3, max = 64)
        String username,

        @NotBlank @Size(min = 10, max = 15)
        String mobile,

        String email,

        UUID departmentId,

        String designation,

        LocalDate joiningDate,

        @NotNull
        ProfileData profileData,

        @NotBlank @Size(min = 8)
        String initialPassword
) {}
