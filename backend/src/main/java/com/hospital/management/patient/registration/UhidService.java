package com.hospital.management.patient.registration;

import com.hospital.management.platform.identity.HospitalProfile;
import com.hospital.management.platform.identity.HospitalProfileRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

@Service
public class UhidService {

    private final JdbcTemplate jdbc;
    private final HospitalProfileRepository profileRepository;

    public UhidService(JdbcTemplate jdbc, HospitalProfileRepository profileRepository) {
        this.jdbc              = jdbc;
        this.profileRepository = profileRepository;
    }

    /**
     * Issues the next UHID for the current year.
     * Atomically increments uhid_sequences.last_seq — safe under concurrent registrations.
     */
    @Transactional
    public String next() {
        HospitalProfile profile = profileRepository.findFirstByDeletedAtIsNull()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Hospital profile not configured"));

        int year = LocalDate.now().getYear();

        Long seq = jdbc.queryForObject(
                "INSERT INTO uhid_sequences (year, last_seq) VALUES (?, 1) " +
                "ON CONFLICT (year) DO UPDATE SET last_seq = uhid_sequences.last_seq + 1 " +
                "RETURNING last_seq",
                Long.class, year);

        String paddedSeq = String.format("%0" + profile.getUhidSequencePadding() + "d", seq);
        String sep = profile.getUhidSeparator();

        return profile.isUhidIncludeYear()
                ? profile.getUhidPrefix() + sep + year + sep + paddedSeq
                : profile.getUhidPrefix() + sep + paddedSeq;
    }
}
