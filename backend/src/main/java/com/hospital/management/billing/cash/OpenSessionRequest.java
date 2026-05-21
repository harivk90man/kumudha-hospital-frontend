package com.hospital.management.billing.cash;

import java.math.BigDecimal;
import java.util.UUID;

public record OpenSessionRequest(
        UUID       counterId,
        String     sessionLabel,   // morning | evening | night | full_day | custom
        BigDecimal openingFloat
) {}
