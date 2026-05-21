package com.hospital.management.opd.queue;

import com.hospital.management.platform.web.PagedResult;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.SortDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * GET /api/queue — live OPD queue for a date.
 *
 * Returns all patients across three states (pending_payment, awaiting_vitals,
 * awaiting_doctor) in one paginated response. All params are optional.
 */
@RestController
public class QueueController {

    private final QueueQueryService queryService;

    public QueueController(QueueQueryService queryService) {
        this.queryService = queryService;
    }

    @GetMapping("/api/queue")
    public PagedResult<QueueEntry> queue(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate date,
            @RequestParam(required = false) UUID doctorId,
            @RequestParam(required = false) String queueStatus,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1")  int page,
            @RequestParam(defaultValue = "20") int size,
            @SortDefault(sort = "waitingSince", direction = Sort.Direction.ASC) Sort sort) {

        LocalDate effectiveDate = date != null ? date : LocalDate.now();
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));

        return queryService.list(effectiveDate, doctorId, queueStatus, q, safePage, safeSize, sort);
    }
}
