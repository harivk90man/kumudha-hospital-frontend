package com.hospital.management.opd.appointment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * Issues the next APT number for the current year.
 * Atomically increments appt_sequences.last_seq — safe under concurrent bookings.
 * Format: APT-{year}-{5-digit-seq} e.g. APT-2026-00001.
 */
@Service
public class ApptNumberService {

    private final JdbcTemplate jdbc;

    public ApptNumberService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public String next() {
        int year = LocalDate.now().getYear();
        Long seq = jdbc.queryForObject(
                "INSERT INTO appt_sequences (year, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (year) DO UPDATE SET last_seq = appt_sequences.last_seq + 1 " +
                "RETURNING last_seq",
                Long.class, year);
        return String.format("APT-%d-%05d", year, seq);
    }
}
