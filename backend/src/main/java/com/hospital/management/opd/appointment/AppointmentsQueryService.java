package com.hospital.management.opd.appointment;

import com.hospital.management.platform.web.PagedResult;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * JdbcTemplate read-side for the appointments list page.
 * Returns enriched rows (patient + doctor join) so the front-desk grid
 * doesn't need extra round-trips. Supports filtering by slotDate,
 * doctorId, status, and a free-text q (UHID prefix or patient name).
 */
@Service
@Transactional(readOnly = true)
public class AppointmentsQueryService {

    private static final ZoneId HOSPITAL_ZONE = ZoneId.of("Asia/Kolkata");

    /** Safe sort field mapping — prevents SQL injection. */
    private static final Map<String, String> SORT_COLS = Map.of(
            "slotTime",       "a.scheduled_at",
            "patient.fullName","p.first_name",
            "doctorName",     "u.full_name",
            "status",         "a.status",
            "bookedAt",       "a.created_at"
    );

    private static final String BASE_SQL = """
            SELECT a.id,
                   a.appointment_no,
                   a.patient_id,
                   a.doctor_id,
                   a.scheduled_at,
                   a.visit_type,
                   a.source,
                   a.status,
                   a.reason        AS chief_complaint,
                   a.created_at    AS booked_at,
                   a.cancelled_at,
                   a.slot_id,
                   p.uhid,
                   p.first_name,
                   p.last_name,
                   p.gender,
                   p.date_of_birth,
                   p.mobile,
                   p.blood_group,
                   u.full_name     AS doctor_name,
                   dp.specialization,
                   alg.allergen_list,
                   t.token_number
            FROM appointments a
            JOIN patients      p   ON a.patient_id = p.id          AND p.deleted_at  IS NULL
            JOIN users         u   ON a.doctor_id  = u.id
            LEFT JOIN doctor_profiles dp
                                   ON a.doctor_id  = dp.user_id    AND dp.deleted_at IS NULL
            LEFT JOIN (
                SELECT pa.patient_id,
                       string_agg(al.allergy_name, ',' ORDER BY al.allergy_name) AS allergen_list
                FROM patient_allergies pa
                JOIN allergies_lookup al ON pa.allergy_id = al.id
                WHERE pa.deleted_at IS NULL
                GROUP BY pa.patient_id
            ) alg ON alg.patient_id = a.patient_id
            LEFT JOIN op_visits ov
                                   ON ov.appointment_id = a.id     AND ov.deleted_at IS NULL
            LEFT JOIN tokens   t   ON t.op_visit_id = ov.id
                                   AND t.service_type = 'consultation'
                                   AND t.deleted_at IS NULL
            WHERE a.deleted_at IS NULL
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public AppointmentsQueryService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public PagedResult<AppointmentResponse> list(
            LocalDate slotDate,
            UUID doctorId,
            String status,
            String q,
            int page,
            int size,
            Sort sort) {

        var params = new MapSqlParameterSource();
        var where  = new StringBuilder(BASE_SQL);

        // date filter — convert scheduled_at to hospital timezone before comparing
        where.append(" AND (a.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = :slotDate");
        params.addValue("slotDate", slotDate);

        if (doctorId != null) {
            where.append(" AND a.doctor_id = :doctorId");
            params.addValue("doctorId", doctorId);
        }
        if (status != null && !status.isBlank() && !"all".equals(status)) {
            where.append(" AND a.status = :status");
            params.addValue("status", status);
        }
        if (q != null && !q.isBlank()) {
            where.append("""
                     AND (p.uhid ILIKE :q
                       OR lower(p.first_name || ' ' || p.last_name) LIKE lower(:qLike))
                    """);
            params.addValue("q",     q.toUpperCase() + "%");
            params.addValue("qLike", "%" + q + "%");
        }

        // COUNT
        String countSql = "SELECT COUNT(*) FROM (" + where + ") _c";
        Long total = jdbc.queryForObject(countSql, params, Long.class);

        // ORDER BY
        String orderBy = buildOrderBy(sort);
        int offset = (page - 1) * size;
        String fullSql = where + " " + orderBy + " LIMIT :limit OFFSET :offset";
        params.addValue("limit",  size);
        params.addValue("offset", offset);

        List<AppointmentResponse> rows = jdbc.query(fullSql, params, (rs, n) -> map(rs));

        return PagedResult.of(rows, PageRequest.of(page - 1, size), total == null ? 0 : total);
    }

    private static String buildOrderBy(Sort sort) {
        if (sort == null || sort.isUnsorted()) return "ORDER BY a.scheduled_at ASC";
        String clause = sort.stream()
                .filter(o -> SORT_COLS.containsKey(o.getProperty()))
                .map(o -> SORT_COLS.get(o.getProperty()) + (o.isAscending() ? " ASC" : " DESC"))
                .collect(Collectors.joining(", "));
        return clause.isBlank() ? "ORDER BY a.scheduled_at ASC" : "ORDER BY " + clause;
    }

    private static AppointmentResponse map(ResultSet rs) throws SQLException {
        OffsetDateTime scheduledAt = rs.getObject("scheduled_at", OffsetDateTime.class);
        String slotDate = scheduledAt == null ? null
                : scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).toLocalDate().toString();
        String slotTime = scheduledAt == null ? null
                : String.format("%02d:%02d",
                        scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).getHour(),
                        scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).getMinute());

        LocalDate dob = rs.getObject("date_of_birth", LocalDate.class);
        int ageYears = dob == null ? 0 : Period.between(dob, LocalDate.now()).getYears();

        String allergenList = rs.getString("allergen_list");
        List<AppointmentResponse.AllergenRef> allergies = allergenList == null
                ? Collections.emptyList()
                : Arrays.stream(allergenList.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isBlank())
                        .map(AppointmentResponse.AllergenRef::new)
                        .toList();

        var patient = new AppointmentResponse.PatientBrief(
                rs.getObject("patient_id", UUID.class),
                rs.getString("uhid"),
                rs.getString("first_name") + " " + rs.getString("last_name"),
                rs.getString("gender"),
                ageYears,
                rs.getString("mobile"),
                rs.getString("blood_group"),
                allergies
        );

        UUID slotId = rs.getObject("slot_id", UUID.class);

        return new AppointmentResponse(
                rs.getObject("id", UUID.class),
                rs.getString("appointment_no"),
                patient,
                rs.getObject("doctor_id", UUID.class),
                rs.getString("doctor_name"),
                rs.getString("specialization"),
                slotId == null ? null : slotId.toString(),
                slotDate,
                slotTime,
                rs.getString("source"),
                rs.getString("status"),
                rs.getString("visit_type"),
                rs.getString("chief_complaint"),
                rs.getString("token_number"),
                rs.getObject("booked_at", OffsetDateTime.class),
                rs.getObject("cancelled_at", OffsetDateTime.class)
        );
    }
}
