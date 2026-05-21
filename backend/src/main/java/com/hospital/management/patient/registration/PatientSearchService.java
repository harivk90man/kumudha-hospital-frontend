package com.hospital.management.patient.registration;

import com.hospital.management.platform.web.PagedResult;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class PatientSearchService {

    private final JdbcTemplate jdbc;

    /** Allowlist: camelCase field name → DB column. Unknown fields are silently skipped. */
    private static final Map<String, String> SORT_COLS = Map.of(
            "uhid",        "uhid",
            "firstName",   "first_name",
            "lastName",    "last_name",
            "dateOfBirth", "date_of_birth",
            "mobile",      "mobile",
            "createdAt",   "created_at"
    );

    public PatientSearchService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Search patients by UHID prefix or mobile contains.
     * Both fields are searched simultaneously — no client-side type detection needed.
     */
    public PagedResult<PatientSearchResult> search(String q, Pageable pageable) {
        if (q == null || q.isBlank()) {
            return PagedResult.empty(pageable);
        }

        String uhidPattern   = q.toUpperCase() + "%";
        String mobilePattern = "%" + q + "%";
        String orderBy       = buildOrderBy(pageable.getSort());
        long   offset        = pageable.getOffset();
        int    size          = pageable.getPageSize();

        String dataSql = """
                SELECT id, uhid, first_name, last_name, date_of_birth, gender, mobile, blood_group
                FROM   patients
                WHERE  deleted_at IS NULL
                  AND  (uhid ILIKE ? OR mobile LIKE ?)
                ORDER BY %s
                LIMIT ? OFFSET ?
                """.formatted(orderBy);

        String countSql = """
                SELECT COUNT(*)
                FROM   patients
                WHERE  deleted_at IS NULL
                  AND  (uhid ILIKE ? OR mobile LIKE ?)
                """;

        List<PatientSearchResult> content = jdbc.query(
                dataSql, this::mapRow,
                uhidPattern, mobilePattern, size, offset);

        Long total = jdbc.queryForObject(countSql, Long.class, uhidPattern, mobilePattern);

        return PagedResult.of(content, pageable, total != null ? total : 0L);
    }

    /** Exact lookup by UHID — used by the patient profile page. */
    public PatientSearchResult findByUhid(String uhid) {
        try {
            return jdbc.queryForObject(
                    """
                    SELECT id, uhid, first_name, last_name, date_of_birth, gender, mobile, blood_group
                    FROM   patients
                    WHERE  uhid = ? AND deleted_at IS NULL
                    """,
                    this::mapRow,
                    uhid.toUpperCase());
        } catch (EmptyResultDataAccessException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Patient not found: " + uhid);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String buildOrderBy(Sort sort) {
        String cols = sort.stream()
                .filter(o -> SORT_COLS.containsKey(o.getProperty()))
                .map(o -> SORT_COLS.get(o.getProperty()) + " " + o.getDirection().name())
                .collect(Collectors.joining(", "));
        return cols.isBlank() ? "uhid ASC" : cols;
    }

    private PatientSearchResult mapRow(ResultSet rs, int rowNum) throws SQLException {
        LocalDate dob = rs.getDate("date_of_birth") != null
                ? rs.getDate("date_of_birth").toLocalDate()
                : null;
        int age = dob != null ? Period.between(dob, LocalDate.now()).getYears() : 0;

        String firstName = rs.getString("first_name");
        String lastName  = rs.getString("last_name");

        return new PatientSearchResult(
                UUID.fromString(rs.getString("id")),
                rs.getString("uhid"),
                firstName,
                lastName,
                (firstName + " " + lastName).trim(),
                rs.getString("gender"),
                age,
                dob != null ? dob.toString() : null,
                rs.getString("mobile"),
                rs.getString("blood_group"));
    }
}
