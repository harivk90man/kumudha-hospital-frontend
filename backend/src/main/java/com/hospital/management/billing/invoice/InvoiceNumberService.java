package com.hospital.management.billing.invoice;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Issues the next invoice number for the current year.
 * Atomically increments invoice_sequences.last_seq — safe under concurrent payments.
 * Format: INV-{year}-{5-digit-seq} e.g. INV-2026-00042.
 */
@Service
public class InvoiceNumberService {

    private final JdbcTemplate jdbc;

    public InvoiceNumberService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public String next() {
        int year = LocalDate.now().getYear();
        Long seq = jdbc.queryForObject(
                "INSERT INTO invoice_sequences (year, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (year) DO UPDATE SET last_seq = invoice_sequences.last_seq + 1 " +
                "RETURNING last_seq",
                Long.class, year);
        return String.format("INV-%d-%05d", year, seq);
    }
}
