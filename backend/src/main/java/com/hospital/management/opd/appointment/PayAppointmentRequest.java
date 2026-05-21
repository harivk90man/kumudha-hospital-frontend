package com.hospital.management.opd.appointment;

import java.util.UUID;

/**
 * Wire shape for POST /api/appointments/{id}/pay.
 * paymentMode and gatewayIdempotencyKey are required.
 * transactionRef is mandatory for card/upi/cheque; null for cash.
 * chiefComplaint may be confirmed or updated at payment time.
 */
public record PayAppointmentRequest(
        String paymentMode,            // cash | card | upi | cheque | net_banking
        String transactionRef,         // UPI txn ID, card RRN — null for cash
        UUID   gatewayIdempotencyKey,  // client-generated UUID for payment_attempts
        String chiefComplaint          // optional override; appointment reason used if null
) {}
