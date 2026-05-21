package com.hospital.management.opd.queue;

import com.hospital.management.opd.appointment.AppointmentResponse;
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
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Reads the live OPD queue for a given date across three states:
 *   pending_payment  — arrived appointment, payment not yet taken
 *   awaiting_vitals  — paid (op_visit exists), patient_states at vitals has left_at = NULL
 *   awaiting_doctor  — vitals done, consultation token is active
 *
 * All three segments are returned together by default. Use queueStatus param to filter.
 */
@Service
@Transactional(readOnly = true)
public class QueueQueryService {

    private static final ZoneId HOSPITAL_ZONE = ZoneId.of("Asia/Kolkata");

    private static final Map<String, String> SORT_COLS = Map.of(
            "waitingSince",    "waiting_since ASC",
            "patient.fullName","first_name ASC",
            "queueStatus",     "queue_status ASC, waiting_since ASC",
            "scheduledAt",     "scheduled_at ASC"
    );

    /**
     * Allergen aggregate — reused in all three UNION segments to avoid
     * three identical subqueries. Declared once in the leading CTE.
     */
    private static final String ALLERGEN_CTE = """
            allergen_agg AS (
                SELECT pa.patient_id,
                       string_agg(al.allergy_name, ',' ORDER BY al.allergy_name) AS allergen_list
                FROM patient_allergies pa
                JOIN allergies_lookup al ON pa.allergy_id = al.id
                WHERE pa.deleted_at IS NULL
                GROUP BY pa.patient_id
            )""";

    /**
     * Common SELECT columns used in all three segments — keeps the UNION column
     * list consistent. Order must match the RowMapper below.
     */
    private static final String PATIENT_COLS = """
            p.uhid, p.first_name, p.last_name, p.gender, p.date_of_birth, p.mobile, p.blood_group,
            u.full_name AS doctor_name, dp.specialization, alg.allergen_list""";

    private static final String QUEUE_CTE = """
            all_queue AS (

              -- ── Segment 1: Not paid ─────────────────────────────────────────
              SELECT
                a.id              AS appointment_id,
                a.appointment_no,
                NULL::text        AS op_number,
                NULL::text        AS token_number,
                a.patient_id,
                a.doctor_id,
                a.scheduled_at,
                'pending_payment' AS queue_status,
                a.created_at      AS waiting_since,
                """ + PATIENT_COLS + """

              FROM appointments a
              JOIN patients p              ON p.id = a.patient_id AND p.deleted_at IS NULL
              JOIN users u                 ON u.id = a.doctor_id
              LEFT JOIN doctor_profiles dp ON dp.user_id = a.doctor_id AND dp.deleted_at IS NULL
              LEFT JOIN allergen_agg alg   ON alg.patient_id = a.patient_id
              WHERE a.status = 'arrived'
                AND (a.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = :date
                AND a.deleted_at IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM op_visits ov
                    WHERE ov.appointment_id = a.id AND ov.deleted_at IS NULL)

              UNION ALL

              -- ── Segment 2: Paid, vitals pending ─────────────────────────────
              SELECT
                a.id, a.appointment_no,
                ov.op_number, t.token_number,
                ov.patient_id, ov.doctor_id,
                COALESCE(a.scheduled_at, ov.created_at),
                'awaiting_vitals',
                pq.created_at,
                """ + PATIENT_COLS + """

              FROM op_visits ov
              LEFT JOIN appointments a     ON a.id = ov.appointment_id
              JOIN patients p              ON p.id = ov.patient_id AND p.deleted_at IS NULL
              JOIN users u                 ON u.id = ov.doctor_id
              LEFT JOIN doctor_profiles dp ON dp.user_id = ov.doctor_id AND dp.deleted_at IS NULL
              LEFT JOIN allergen_agg alg   ON alg.patient_id = ov.patient_id
              LEFT JOIN tokens t           ON t.op_visit_id = ov.id
                                         AND t.service_type = 'consultation'
                                         AND t.deleted_at IS NULL
              JOIN patient_states pq       ON pq.op_visit_id = ov.id AND pq.deleted_at IS NULL
              JOIN stations s              ON s.id = pq.station_id
              WHERE s.station_type = 'vitals'
                AND pq.left_at IS NULL
                AND ov.visit_date = :date
                AND ov.deleted_at IS NULL

              UNION ALL

              -- ── Segment 3: Vitals done, awaiting doctor ──────────────────────
              SELECT
                a.id, a.appointment_no,
                ov.op_number, t.token_number,
                ov.patient_id, ov.doctor_id,
                COALESCE(a.scheduled_at, ov.created_at),
                'awaiting_doctor',
                t.created_at,
                """ + PATIENT_COLS + """

              FROM op_visits ov
              LEFT JOIN appointments a     ON a.id = ov.appointment_id
              JOIN patients p              ON p.id = ov.patient_id AND p.deleted_at IS NULL
              JOIN users u                 ON u.id = ov.doctor_id
              LEFT JOIN doctor_profiles dp ON dp.user_id = ov.doctor_id AND dp.deleted_at IS NULL
              LEFT JOIN allergen_agg alg   ON alg.patient_id = ov.patient_id
              JOIN tokens t                ON t.op_visit_id = ov.id
                                         AND t.service_type = 'consultation'
                                         AND t.deleted_at IS NULL
              WHERE t.status = 'active'
                AND ov.visit_date = :date
                AND ov.deleted_at IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM patient_states pq
                    JOIN stations s ON s.id = pq.station_id
                    WHERE pq.op_visit_id = ov.id
                      AND s.station_type = 'vitals'
                      AND pq.left_at IS NULL
                      AND pq.deleted_at IS NULL)
            )""";

    private static final String CTE_PREFIX = "WITH " + ALLERGEN_CTE + ",\n" + QUEUE_CTE + "\n";

    private final NamedParameterJdbcTemplate jdbc;

    public QueueQueryService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public PagedResult<QueueEntry> list(
            LocalDate date,
            UUID doctorId,
            String queueStatus,
            String q,
            int page,
            int size,
            Sort sort) {

        var params = new MapSqlParameterSource();
        params.addValue("date", date);
        params.addValue("doctorId",     doctorId);
        params.addValue("queueStatus",  queueStatus != null && !queueStatus.isBlank() ? queueStatus : null);

        if (q != null && !q.isBlank()) {
            params.addValue("q",       q);
            params.addValue("qPrefix", q.toUpperCase() + "%");
            params.addValue("qLike",   "%" + q.toLowerCase() + "%");
        } else {
            params.addValue("q",       null);
            params.addValue("qPrefix", null);
            params.addValue("qLike",   null);
        }

        String outerWhere = """
                SELECT * FROM all_queue
                WHERE (:doctorId::uuid IS NULL OR doctor_id    = :doctorId::uuid)
                  AND (:queueStatus::text IS NULL OR queue_status = :queueStatus::text)
                  AND (:q::text IS NULL
                       OR uhid ILIKE :qPrefix::text
                       OR lower(first_name || ' ' || last_name) LIKE :qLike::text)
                """;

        // COUNT — same CTE, outer WHERE, wrapped
        String countSql = CTE_PREFIX +
                "SELECT COUNT(*) FROM (" + outerWhere + ") _c";
        Long total = jdbc.queryForObject(countSql, params, Long.class);

        // DATA
        String orderBy = buildOrderBy(sort);
        int offset = (page - 1) * size;
        params.addValue("limit",  size);
        params.addValue("offset", offset);

        String dataSql = CTE_PREFIX + outerWhere +
                orderBy + " LIMIT :limit OFFSET :offset";

        List<QueueEntry> rows = jdbc.query(dataSql, params, (rs, n) -> map(rs));

        return PagedResult.of(rows, PageRequest.of(page - 1, size), total == null ? 0 : total);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String buildOrderBy(Sort sort) {
        if (sort == null || sort.isUnsorted()) return "ORDER BY waiting_since ASC";
        String clause = sort.stream()
                .filter(o -> SORT_COLS.containsKey(o.getProperty()))
                .map(o -> {
                    String col = SORT_COLS.get(o.getProperty());
                    // Multi-column entries (queueStatus) already include direction
                    return col.contains(" ") ? col
                            : col + (o.isAscending() ? " ASC" : " DESC");
                })
                .collect(Collectors.joining(", "));
        return clause.isBlank() ? "ORDER BY waiting_since ASC" : "ORDER BY " + clause;
    }

    private static QueueEntry map(ResultSet rs) throws SQLException {
        LocalDate dob    = rs.getObject("date_of_birth", LocalDate.class);
        int ageYears     = dob == null ? 0 : Period.between(dob, LocalDate.now()).getYears();

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
                allergies);

        return new QueueEntry(
                rs.getObject("appointment_id", UUID.class),   // null for walk-in without appt
                rs.getString("appointment_no"),
                rs.getString("op_number"),
                rs.getString("token_number"),
                patient,
                rs.getObject("doctor_id", UUID.class),
                rs.getString("doctor_name"),
                rs.getString("specialization"),
                rs.getObject("scheduled_at", OffsetDateTime.class),
                rs.getString("queue_status"),
                rs.getObject("waiting_since", OffsetDateTime.class));
    }
}
