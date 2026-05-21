package com.hospital.management.platform.identity;

public enum UserStatus {
    ACTIVE, INACTIVE, SUSPENDED;

    public String dbValue() {
        return name().toLowerCase();
    }

    public static UserStatus fromDbValue(String value) {
        return valueOf(value.toUpperCase());
    }
}
