package com.hospital.management.opd.appointment;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hospital.management.billing.cash.CashSession;
import com.hospital.management.billing.cash.CashSessionService;
import com.hospital.management.clinical.consultation.Consultation;
import com.hospital.management.clinical.consultation.ConsultationRepository;
import com.hospital.management.billing.invoice.Invoice;
import com.hospital.management.billing.invoice.InvoiceItem;
import com.hospital.management.billing.invoice.InvoiceItemRepository;
import com.hospital.management.billing.invoice.InvoiceNumberService;
import com.hospital.management.billing.invoice.InvoiceRepository;
import com.hospital.management.billing.payment.Payment;
import com.hospital.management.billing.payment.PaymentAllocation;
import com.hospital.management.billing.payment.PaymentAllocationRepository;
import com.hospital.management.billing.payment.PaymentAttempt;
import com.hospital.management.billing.payment.PaymentAttemptRepository;
import com.hospital.management.billing.payment.PaymentRepository;
import com.hospital.management.opd.encounter.OpNumberService;
import com.hospital.management.opd.encounter.OpVisit;
import com.hospital.management.opd.encounter.OpVisitRepository;
import com.hospital.management.opd.encounter.PatientStates;
import com.hospital.management.opd.encounter.PatientStatesRepository;
import com.hospital.management.opd.journey.StationRepository;
import com.hospital.management.patient.registration.Patient;
import com.hospital.management.patient.registration.PatientRepository;
import com.hospital.management.platform.identity.DoctorProfile;
import com.hospital.management.platform.identity.DoctorProfileRepository;
import com.hospital.management.platform.identity.User;
import com.hospital.management.platform.identity.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class OpdFlowService {

    private static final ZoneId HOSPITAL_ZONE = ZoneId.of("Asia/Kolkata");

    private final AppointmentRepository     appointmentRepository;
    private final OpVisitRepository         opVisitRepository;
    private final PatientStatesRepository   patientStatesRepository;
    private final StationRepository         stationRepository;
    private final TokenRepository           tokenRepository;
    private final PatientRepository         patientRepository;
    private final UserRepository            userRepository;
    private final DoctorProfileRepository   doctorProfileRepository;
    private final ApptNumberService         apptNumberService;
    private final OpNumberService           opNumberService;
    private final InvoiceNumberService      invoiceNumberService;
    private final InvoiceRepository         invoiceRepository;
    private final InvoiceItemRepository     invoiceItemRepository;
    private final PaymentRepository         paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;
    private final PaymentAttemptRepository  paymentAttemptRepository;
    private final CashSessionService        cashSessionService;
    private final ConsultationRepository    consultationRepository;
    private final JdbcTemplate              jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;
    private final ObjectMapper              objectMapper;

    public OpdFlowService(AppointmentRepository appointmentRepository,
                          OpVisitRepository opVisitRepository,
                          PatientStatesRepository patientStatesRepository,
                          StationRepository stationRepository,
                          TokenRepository tokenRepository,
                          PatientRepository patientRepository,
                          UserRepository userRepository,
                          DoctorProfileRepository doctorProfileRepository,
                          ApptNumberService apptNumberService,
                          OpNumberService opNumberService,
                          InvoiceNumberService invoiceNumberService,
                          InvoiceRepository invoiceRepository,
                          InvoiceItemRepository invoiceItemRepository,
                          PaymentRepository paymentRepository,
                          PaymentAllocationRepository paymentAllocationRepository,
                          PaymentAttemptRepository paymentAttemptRepository,
                          CashSessionService cashSessionService,
                          ConsultationRepository consultationRepository,
                          JdbcTemplate jdbc,
                          NamedParameterJdbcTemplate namedJdbc,
                          ObjectMapper objectMapper) {
        this.appointmentRepository      = appointmentRepository;
        this.opVisitRepository          = opVisitRepository;
        this.patientStatesRepository    = patientStatesRepository;
        this.stationRepository          = stationRepository;
        this.tokenRepository            = tokenRepository;
        this.patientRepository          = patientRepository;
        this.userRepository             = userRepository;
        this.doctorProfileRepository    = doctorProfileRepository;
        this.apptNumberService          = apptNumberService;
        this.opNumberService            = opNumberService;
        this.invoiceNumberService       = invoiceNumberService;
        this.invoiceRepository          = invoiceRepository;
        this.invoiceItemRepository      = invoiceItemRepository;
        this.paymentRepository          = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
        this.paymentAttemptRepository   = paymentAttemptRepository;
        this.cashSessionService         = cashSessionService;
        this.consultationRepository     = consultationRepository;
        this.jdbc                       = jdbc;
        this.namedJdbc                  = namedJdbc;
        this.objectMapper               = objectMapper;
    }

    // ── Create appointment ────────────────────────────────────────────────────

    public AppointmentResponse createAppointment(AppointmentRequest req, UUID actorId) {
        Patient patient = patientRepository.findById(req.patientId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Patient not found: " + req.patientId()));

        OffsetDateTime scheduledAt = req.scheduledAt() != null
                ? req.scheduledAt()
                : OffsetDateTime.now();

        String appointmentNo = apptNumberService.next();
        Appointment appt = new Appointment(
                appointmentNo, req.patientId(), req.doctorId(),
                scheduledAt, req.visitType(), req.source(), actorId);
        appt.setReason(req.chiefComplaint());
        appt.setSlotId(req.slotId());

        LocalDate apptDate = scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).toLocalDate();
        if ("walk_in".equals(req.source()) && !apptDate.isAfter(LocalDate.now(HOSPITAL_ZONE))) {
            appt.setStatus("arrived");
        }

        return toResponse(appointmentRepository.save(appt), patient);
    }

    // ── Arrive ────────────────────────────────────────────────────────────────

    public AppointmentResponse arrive(UUID appointmentId, UUID actorId) {
        Appointment appt = requireAppointment(appointmentId);

        if (!"booked".equals(appt.getStatus()) && !"confirmed".equals(appt.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Can only mark 'booked' or 'confirmed' appointments as arrived. Current: " + appt.getStatus());
        }

        appt.setStatus("arrived");
        appt.setUpdatedBy(actorId);
        Patient patient = patientRepository.findById(appt.getPatientId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Patient not found"));
        return toResponse(appointmentRepository.save(appt), patient);
    }

    // ── Update appointment ────────────────────────────────────────────────────

    public AppointmentResponse updateAppointment(UUID appointmentId,
                                                 UpdateAppointmentRequest req,
                                                 UUID actorId) {
        Appointment appt = requireAppointment(appointmentId);

        if (opVisitRepository.findByAppointmentIdAndDeletedAtIsNull(appointmentId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "OP visit already issued for this appointment — modification not allowed after payment");
        }

        LocalDate apptDate = appt.getScheduledAt().atZoneSameInstant(HOSPITAL_ZONE).toLocalDate();
        if (apptDate.isBefore(LocalDate.now(HOSPITAL_ZONE))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Past appointments cannot be modified — rebook instead");
        }

        if (req.scheduledAt() != null) {
            LocalDate newDate = req.scheduledAt().atZoneSameInstant(HOSPITAL_ZONE).toLocalDate();
            if (newDate.isBefore(LocalDate.now(HOSPITAL_ZONE))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "New appointment date must be today or a future date");
            }
            appt.setScheduledAt(req.scheduledAt());
        }

        if (req.doctorId() != null)  appt.setDoctorId(req.doctorId());
        if (req.patientId() != null) appt.setPatientId(req.patientId());

        appt.setUpdatedBy(actorId);

        Patient patient = patientRepository.findById(appt.getPatientId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Patient not found: " + appt.getPatientId()));

        return toResponse(appointmentRepository.save(appt), patient);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    public AppointmentResponse cancel(UUID appointmentId, String cancelReason, UUID actorId) {
        Appointment appt = requireAppointment(appointmentId);

        if (!appt.isCancellable()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot cancel appointment in status: " + appt.getStatus());
        }

        appt.cancel(actorId, cancelReason);
        Patient patient = patientRepository.findById(appt.getPatientId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Patient not found"));
        return toResponse(appointmentRepository.save(appt), patient);
    }

    // ── Pay → full 11-write atomic transaction ────────────────────────────────

    public PayAppointmentResponse pay(UUID appointmentId, PayAppointmentRequest req, UUID actorId) {
        Appointment appt = requireAppointment(appointmentId);

        if (!"arrived".equals(appt.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Payment requires 'arrived' status. Current: " + appt.getStatus());
        }

        // Idempotency guard — payment already processed for this appointment
        opVisitRepository.findByAppointmentIdAndDeletedAtIsNull(appointmentId).ifPresent(existing ->
            { throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Payment already processed. OP: " + existing.getOpNumber()); });

        // ── Pre-reads (fail fast before any write) ────────────────────────

        CashSession session = cashSessionService.requireOpenSession(actorId);

        DoctorProfile dp = doctorProfileRepository.findByUser_IdAndDeletedAtIsNull(appt.getDoctorId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "No doctor profile found for doctor: " + appt.getDoctorId()));
        BigDecimal fee = dp.getConsultationFee();

        var vitalsStation = stationRepository.findByStationTypeAndDeletedAtIsNull("vitals")
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Vitals station not configured"));

        String complaint = (req != null && req.chiefComplaint() != null && !req.chiefComplaint().isBlank())
                ? req.chiefComplaint()
                : appt.getReason();

        UUID idempotencyKey = (req != null && req.gatewayIdempotencyKey() != null)
                ? req.gatewayIdempotencyKey()
                : UUID.randomUUID();
        String paymentMode  = (req != null && req.paymentMode() != null) ? req.paymentMode() : "cash";
        String txnRef       = req != null ? req.transactionRef() : null;

        // ── Write 1: payment_attempts INSERT (initiated) ──────────────────

        PaymentAttempt attempt = new PaymentAttempt(
                appointmentId, null, null, null,
                idempotencyKey, fee, paymentMode, actorId);
        attempt = paymentAttemptRepository.save(attempt);

        // ── Write 2–3: op_sequences + op_visits ──────────────────────────

        String opNumber = opNumberService.next();
        OpVisit visit   = new OpVisit(
                opNumber, appt.getPatientId(), appointmentId,
                appt.getDoctorId(), LocalDate.now(), actorId);
        visit.setChiefComplaint(complaint);
        visit = opVisitRepository.save(visit);

        // ── Write 4: consultations (draft shell — doctor fills in later) ──

        Consultation consultation = new Consultation(visit.getId(), appt.getPatientId(),
                appt.getDoctorId(), objectMapper.createArrayNode(), actorId);
        consultation.setChiefComplaint(complaint);
        consultation = consultationRepository.save(consultation);

        // ── Write 5–6: invoice_sequences + invoices ───────────────────────

        String invoiceNumber = invoiceNumberService.next();
        Invoice invoice = new Invoice(
                invoiceNumber, "op", appt.getPatientId(),
                visit.getId(), null, idempotencyKey, actorId);
        invoice = invoiceRepository.save(invoice);

        // ── Write 7: invoice_items ────────────────────────────────────────
        // fn_recompute_invoice_totals trigger fires → invoices.total_amount set

        invoiceItemRepository.save(new InvoiceItem(
                invoice.getId(), null, "consultation", "Consultation Fee",
                1, 1, fee, fee, consultation.getId(), actorId));

        // ── Write 8: payments ─────────────────────────────────────────────

        Payment payment = new Payment(
                appt.getPatientId(), null, "in", paymentMode,
                fee, actorId, session.getId(), idempotencyKey, null, actorId);
        payment.setTransactionRef(txnRef);
        payment = paymentRepository.save(payment);

        // ── Write 9: payment_allocations ──────────────────────────────────
        // fn_update_invoice_paid_amount trigger fires →
        // invoices.amount_paid updated, payment_status → 'paid'

        paymentAllocationRepository.save(new PaymentAllocation(
                payment.getId(), "invoice", invoice.getId(),
                null, null, fee, null, actorId));

        // ── Write 10: payment_attempts UPDATE (success) ───────────────────

        attempt.markSuccess(payment.getId(), txnRef, null, actorId);
        paymentAttemptRepository.save(attempt);

        // ── Write 11: tokens ──────────────────────────────────────────────

        int    seq         = nextTokenSeq(appt.getDoctorId(), LocalDate.now());
        String tokenNumber = String.format("C-%03d", seq);
        tokenRepository.save(new Token(
                tokenNumber, seq, "consultation",
                appt.getDoctorId(), LocalDate.now(), visit.getId(),
                actorId, actorId));

        // ── Write 12: patient_states — first entry is always Vitals ──────

        patientStatesRepository.save(
                new PatientStates(appt.getPatientId(), visit.getId(),
                        vitalsStation.getId(), actorId));

        return new PayAppointmentResponse(
                appointmentId, appt.getAppointmentNo(), opNumber, tokenNumber,
                appt.getPatientId(), appt.getDoctorId());
    }

    // ── Doctors list (for booking-form dropdown) ──────────────────────────────

    @Transactional(readOnly = true)
    public List<DoctorSummary> listDoctors() {
        return namedJdbc.query("""
                SELECT u.id, u.full_name, dp.specialization
                FROM users u
                JOIN user_roles ur ON ur.user_id = u.id
                JOIN roles r       ON r.id = ur.role_id
                LEFT JOIN doctor_profiles dp ON dp.user_id = u.id AND dp.deleted_at IS NULL
                WHERE r.role_code = 'doctor'
                  AND u.status = 'active'
                  AND u.deleted_at IS NULL
                  AND ur.is_primary = true
                ORDER BY u.full_name
                """,
                (rs, n) -> new DoctorSummary(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("full_name"),
                        rs.getString("specialization")));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Appointment requireAppointment(UUID id) {
        return appointmentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Appointment not found: " + id));
    }

    private AppointmentResponse toResponse(Appointment a, Patient p) {
        OffsetDateTime scheduledAt = a.getScheduledAt();
        String slotDate = scheduledAt == null ? null
                : scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).toLocalDate().toString();
        String slotTime = scheduledAt == null ? null
                : String.format("%02d:%02d",
                        scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).getHour(),
                        scheduledAt.atZoneSameInstant(HOSPITAL_ZONE).getMinute());

        User doctor = userRepository.findById(a.getDoctorId()).orElse(null);
        String doctorName = doctor != null ? doctor.getFullName() : null;
        DoctorProfile dp = doctorProfileRepository.findByUser_IdAndDeletedAtIsNull(a.getDoctorId()).orElse(null);
        String department = dp != null ? dp.getSpecialization() : null;

        int ageYears = p.getDateOfBirth() != null
                ? Period.between(p.getDateOfBirth(), LocalDate.now()).getYears()
                : 0;

        var patientBrief = new AppointmentResponse.PatientBrief(
                p.getId(), p.getUhid(),
                p.getFirstName() + " " + p.getLastName(),
                p.getGender(), ageYears, p.getMobile(),
                p.getBloodGroup(), Collections.emptyList());

        return new AppointmentResponse(
                a.getId(), a.getAppointmentNo(),
                patientBrief,
                a.getDoctorId(), doctorName, department,
                a.getSlotId() == null ? null : a.getSlotId().toString(),
                slotDate, slotTime,
                a.getSource(), a.getStatus(), a.getVisitType(), a.getReason(),
                null,
                a.getCreatedAt(), a.getCancelledAt());
    }

    private int nextTokenSeq(UUID doctorId, LocalDate issueDate) {
        Integer max = jdbc.queryForObject(
                "SELECT COALESCE(MAX(token_sequence), 0) FROM tokens " +
                "WHERE service_type = 'consultation' AND provider_id = ? AND issue_date = ?",
                Integer.class, doctorId, issueDate);
        return (max == null ? 0 : max) + 1;
    }
}
