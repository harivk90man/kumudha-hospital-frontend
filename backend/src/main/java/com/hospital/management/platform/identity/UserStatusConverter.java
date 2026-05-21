package com.hospital.management.platform.identity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class UserStatusConverter implements AttributeConverter<UserStatus, String> {

    @Override
    public String convertToDatabaseColumn(UserStatus status) {
        return status == null ? null : status.dbValue();
    }

    @Override
    public UserStatus convertToEntityAttribute(String dbValue) {
        return dbValue == null ? null : UserStatus.fromDbValue(dbValue);
    }
}
