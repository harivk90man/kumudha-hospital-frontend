package com.hospital.management.platform.identity;

public record HospitalAddress(
        String line1,
        String line2,
        String city,
        String state,
        String pincode,
        String country,
        String gstStateCode
) {}
