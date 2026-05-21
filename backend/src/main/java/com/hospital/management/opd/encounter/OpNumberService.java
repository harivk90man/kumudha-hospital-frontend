package com.hospital.management.opd.encounter;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Issues the next OP number for the current year.
 * Atomically increments op_sequences.last_seq — safe under concurrent payments.
 * Format: OP-{year}-{5-digit-seq} e.g. OP-2026-00101.
 *
 * Only called from OpdFlowService.pay() — the payment step — enforcing
 * the invariant that OP numbers are never issued before payment.
 */
@Service
public class OpNumberService {

    private final JdbcTemplate jdbc;

    public OpNumberService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public String next() {
        int year = LocalDate.now().getYear();
        Long seq = jdbc.queryForObject(
                "INSERT INTO op_sequences (year, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (year) DO UPDATE SET last_seq = op_sequences.last_seq + 1 " +
                "RETURNING last_seq",
                Long.class, year);
        return String.format("OP-%d-%05d", year, seq);
    }
}
