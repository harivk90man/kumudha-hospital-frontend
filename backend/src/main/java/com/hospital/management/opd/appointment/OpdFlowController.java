package com.hospital.management.opd.appointment;

import com.hospital.management.platform.SecurityUtils;
import com.hospital.management.platform.web.PagedResult;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.SortDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * OPD appointment lifecycle — five endpoints:
 *
 *   POST  /api/appointments                → create (walk-in at 'arrived'; pre-booked at 'booked')
 *   GET   /api/appointments                → list for a day (with patient + doctor join)
 *   PATCH /api/appointments/{id}/arrive    → mark pre-booked patient as physically present
 *   POST  /api/appointments/{id}/cancel    → cancel a booked appointment
 *   POST  /api/appointments/{id}/pay       → payment: issues OP number + consultation token
 *   GET   /api/doctors                     → bookable doctor list for the booking form
 */
@RestController
public class OpdFlowController {

    private final OpdFlowService         service;
    private final AppointmentsQueryService queryService;

    public OpdFlowController(OpdFlowService service, AppointmentsQueryService queryService) {
        this.service      = service;
        this.queryService = queryService;
    }

    // ── Appointments CRUD ─────────────────────────────────────────────────────

    @PostMapping("/api/appointments")
    @ResponseStatus(HttpStatus.CREATED)
    public AppointmentResponse create(@Valid @RequestBody AppointmentRequest req,
                                      Authentication auth) {
        return service.createAppointment(req, SecurityUtils.requireActorId(auth));
    }

    /**
     * List appointments for a date. Defaults to today.
     * Supports ?doctorId=&status=&q=&page=&size=&sort= per CLAUDE.md §3.4.
     */
    @GetMapping("/api/appointments")
    public PagedResult<AppointmentResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate slotDate,
            @RequestParam(required = false) UUID doctorId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @SortDefault(sort = "slotTime", direction = Sort.Direction.ASC) Sort sort) {

        LocalDate date = slotDate != null ? slotDate : LocalDate.now();
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        return queryService.list(date, doctorId, status, q, safePage, safeSize, sort);
    }

    @PatchMapping("/api/appointments/{id}")
    public AppointmentResponse update(@PathVariable UUID id,
                                      @RequestBody UpdateAppointmentRequest req,
                                      Authentication auth) {
        return service.updateAppointment(id, req, SecurityUtils.requireActorId(auth));
    }

    @PatchMapping("/api/appointments/{id}/arrive")
    public AppointmentResponse arrive(@PathVariable UUID id, Authentication auth) {
        return service.arrive(id, SecurityUtils.requireActorId(auth));
    }

    @PostMapping("/api/appointments/{id}/cancel")
    public AppointmentResponse cancel(@PathVariable UUID id,
                                      @RequestBody(required = false) CancelRequest req,
                                      Authentication auth) {
        String reason = req != null ? req.reason() : null;
        return service.cancel(id, reason, SecurityUtils.requireActorId(auth));
    }

    @PostMapping("/api/appointments/{id}/pay")
    @ResponseStatus(HttpStatus.CREATED)
    public PayAppointmentResponse pay(@PathVariable UUID id,
                                      @RequestBody(required = false) PayAppointmentRequest req,
                                      Authentication auth) {
        return service.pay(id, req, SecurityUtils.requireActorId(auth));
    }

    // ── Doctors (booking form dropdown) ───────────────────────────────────────

    @GetMapping("/api/doctors")
    public List<DoctorSummary> doctors() {
        return service.listDoctors();
    }

    // ── Inline request ────────────────────────────────────────────────────────

    record CancelRequest(String reason) {}
}
