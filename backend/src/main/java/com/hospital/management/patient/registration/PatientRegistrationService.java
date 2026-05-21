package com.hospital.management.patient.registration;

import com.hospital.management.patient.records.PatientAllergy;
import com.hospital.management.patient.records.PatientAllergyRepository;
import com.hospital.management.patient.records.PatientChronicCondition;
import com.hospital.management.patient.records.PatientChronicConditionRepository;
import com.hospital.management.platform.lookup.AllergyLookup;
import com.hospital.management.platform.lookup.AllergyLookupRepository;
import com.hospital.management.platform.lookup.ChronicConditionLookup;
import com.hospital.management.platform.lookup.ChronicConditionLookupRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class PatientRegistrationService {

    private final PatientRepository            patientRepository;
    private final PatientGovtIdRepository      govtIdRepository;
    private final PatientAllergyRepository     allergyRepository;
    private final PatientChronicConditionRepository conditionRepository;
    private final AllergyLookupRepository      allergyLookupRepository;
    private final ChronicConditionLookupRepository conditionLookupRepository;
    private final UhidService                  uhidService;

    public PatientRegistrationService(
            PatientRepository patientRepository,
            PatientGovtIdRepository govtIdRepository,
            PatientAllergyRepository allergyRepository,
            PatientChronicConditionRepository conditionRepository,
            AllergyLookupRepository allergyLookupRepository,
            ChronicConditionLookupRepository conditionLookupRepository,
            UhidService uhidService) {
        this.patientRepository      = patientRepository;
        this.govtIdRepository       = govtIdRepository;
        this.allergyRepository      = allergyRepository;
        this.conditionRepository    = conditionRepository;
        this.allergyLookupRepository = allergyLookupRepository;
        this.conditionLookupRepository = conditionLookupRepository;
        this.uhidService            = uhidService;
    }

    public PatientRegistrationResponse register(PatientRegistrationRequest req, UUID actorId) {

        if (patientRepository.existsByMobileAndDeletedAtIsNull(req.mobile())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A patient with this mobile number is already registered");
        }

        String uhid = uhidService.next();

        Patient patient = new Patient(
                uhid,
                req.firstName(),
                req.lastName(),
                req.dateOfBirth(),
                req.gender(),
                "web",
                actorId);

        patient.setMobile(req.mobile());
        patient.setAltMobile(req.altMobile());
        patient.setEmail(req.email());
        patient.setBloodGroup(req.bloodGroup());
        if (req.address() != null) {
            patient.updateAddress(req.address());
        }

        patient = patientRepository.save(patient);
        UUID patientId = patient.getId();

        // Government IDs
        if (hasText(req.aadhaar())) {
            govtIdRepository.save(new PatientGovtId(patientId, "aadhaar", req.aadhaar().trim(), actorId));
        }
        if (hasText(req.pan())) {
            govtIdRepository.save(new PatientGovtId(patientId, "pan", req.pan().trim().toUpperCase(), actorId));
        }

        // Allergies — resolve label → lookup UUID, auto-create if unknown
        List<PatientRegistrationResponse.AllergyDto> allergyDtos = List.of();
        if (req.allergies() != null && !req.allergies().isEmpty()) {
            allergyDtos = req.allergies().stream()
                    .filter(a -> a != null && !a.isBlank())
                    .map(label -> resolveOrCreateAllergy(label.trim(), patientId, actorId))
                    .toList();
        }

        // Chronic conditions — same pattern
        List<String> conditionNames = List.of();
        if (req.chronicConditions() != null && !req.chronicConditions().isEmpty()) {
            conditionNames = req.chronicConditions().stream()
                    .filter(c -> c != null && !c.isBlank())
                    .peek(label -> resolveOrCreateCondition(label.trim(), patientId, actorId))
                    .toList();
        }

        return toResponse(patient, allergyDtos, conditionNames);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private PatientRegistrationResponse.AllergyDto resolveOrCreateAllergy(
            String label, UUID patientId, UUID actorId) {

        AllergyLookup lookup = allergyLookupRepository
                .findByAllergyNameIgnoreCaseAndDeletedAtIsNull(label)
                .orElseGet(() -> {
                    String code = toCode(label);
                    AllergyLookup newEntry = new AllergyLookup(code, label, "other", actorId);
                    return allergyLookupRepository.save(newEntry);
                });

        if (!allergyRepository.existsByPatientIdAndAllergyIdAndDeletedAtIsNull(patientId, lookup.getId())) {
            allergyRepository.save(new PatientAllergy(patientId, lookup.getId(), "mild", "patient_reported", actorId));
        }

        return new PatientRegistrationResponse.AllergyDto(lookup.getAllergyName(), null);
    }

    private void resolveOrCreateCondition(String label, UUID patientId, UUID actorId) {
        ChronicConditionLookup lookup = conditionLookupRepository
                .findByConditionNameIgnoreCaseAndDeletedAtIsNull(label)
                .orElseGet(() -> {
                    String code = toCode(label);
                    ChronicConditionLookup newEntry = new ChronicConditionLookup(code, label, actorId);
                    return conditionLookupRepository.save(newEntry);
                });

        if (!conditionRepository.existsByPatientIdAndConditionIdAndDeletedAtIsNull(patientId, lookup.getId())) {
            conditionRepository.save(new PatientChronicCondition(patientId, lookup.getId(), "unknown", actorId));
        }
    }

    private static PatientRegistrationResponse toResponse(
            Patient p,
            List<PatientRegistrationResponse.AllergyDto> allergies,
            List<String> chronicConditions) {

        int age = Period.between(p.getDateOfBirth(), LocalDate.now()).getYears();

        return new PatientRegistrationResponse(
                p.getId(),
                p.getUhid(),
                p.getFirstName(),
                p.getLastName(),
                p.getFirstName() + " " + p.getLastName(),
                p.getGender(),
                age,
                p.getDateOfBirth().toString(),
                p.getMobile(),
                p.getAltMobile(),
                p.getEmail(),
                p.getBloodGroup(),
                p.getAddress(),
                allergies,
                chronicConditions);
    }

    /** "Type 2 Diabetes" → "TYPE_2_DIABETES" */
    private static String toCode(String name) {
        return name.toUpperCase().replaceAll("[^A-Z0-9]+", "_").replaceAll("^_|_$", "");
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
