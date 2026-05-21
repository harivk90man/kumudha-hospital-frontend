package com.hospital.management.platform.logging;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
        String  requestId,
        int     status,
        String  error,
        String  message,
        String  path,
        OffsetDateTime timestamp
) {}
