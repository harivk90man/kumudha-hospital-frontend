package com.hospital.management.clinical.vitals;

import com.hospital.management.opd.encounter.OpVisit;
import com.hospital.management.opd.encounter.OpVisitRepository;
import com.hospital.management.opd.encounter.PatientStatesRepository;
import com.hospital.management.opd.journey.StationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Records vitals for an OP visit and advances the patient from
 * awaiting_vitals → awaiting_doctor by closing the vitals patient_states row.
 *
 * The state transition is implicit: the live-queue query (QueueQueryService)
 * shows a patient as awaiting_vitals while their patient_states vitals row has
 * left_at = NULL. Closing that row (setting left_at) causes them to fall into
 * Segment 3 (awaiting_doctor) on the next queue refresh.
 */
@Service
@Transactional
public class VitalsService {

    private final VitalsRepository        vitalsRepository;
    private final OpVisitRepository       opVisitRepository;
    private final PatientStatesRepository patientStatesRepository;
    private final StationRepository       stationRepository;

    public VitalsService(VitalsRepository vitalsRepository,
                         OpVisitRepository opVisitRepository,
                         PatientStatesRepository patientStatesRepository,
                         StationRepository stationRepository) {
        this.vitalsRepository        = vitalsRepository;
        this.opVisitRepository       = opVisitRepository;
        this.patientStatesRepository = patientStatesRepository;
        this.stationRepository       = stationRepository;
    }

    /**
     * Records vitals and closes the active vitals patient_states row so the
     * patient advances to awaiting_doctor.
     */
    public UUID record(String opNumber, VitalsRequest req, UUID actorId) {
        OpVisit visit = opVisitRepository.findByOpNumberAndDeletedAtIsNull(opNumber)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "OP visit not found: " + opNumber));

        // 1. Close the active vitals state row — patient moves to awaiting_doctor.
        var vitalsStation = stationRepository.findByStationTypeAndDeletedAtIsNull("vitals")
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "Vitals station not configured"));

        patientStatesRepository
                .findByOpVisitIdAndLeftAtIsNull(visit.getId())
                .filter(ps -> vitalsStation.getId().equals(ps.getStationId()))
                .ifPresent(ps -> {
                    ps.close(actorId);
                    patientStatesRepository.save(ps);
                });

        // 2. Update chief complaint on the visit if the nurse captured it.
        if (req.chiefComplaint() != null && !req.chiefComplaint().isBlank()) {
            visit.setChiefComplaint(req.chiefComplaint());
            visit.setUpdatedBy(actorId);
            opVisitRepository.save(visit);
        }

        // 3. Insert the vitals record.
        Vitals vitals = new Vitals(visit.getPatientId(), visit.getId(), actorId);
        vitals.setBpSystolic(req.bpSystolic());
        vitals.setBpDiastolic(req.bpDiastolic());
        vitals.setPulseRate(req.pulseRate());
        vitals.setSpo2(req.spo2());
        vitals.setTemperature(req.temperatureF());
        vitals.setRespiratoryRate(req.respiratoryRate());
        vitals.setWeightKg(req.weightKg());
        vitals.setHeightCm(req.heightCm());
        vitals.setBloodSugarMgDl(req.bloodSugarRandom());
        vitals.setPainScore(req.painScore());
        vitals.setNotes(req.notes());

        return vitalsRepository.save(vitals).getId();
    }
}
