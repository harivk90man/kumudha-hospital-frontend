package com.hospital.management.clinical.vitals;

import com.hospital.management.platform.SecurityUtils;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * POST /api/visits/{opNumber}/vitals — nurse captures vitals and
 * advances the patient queue from awaiting_vitals to awaiting_doctor.
 */
@RestController
public class VitalsController {

    private final VitalsService service;

    public VitalsController(VitalsService service) {
        this.service = service;
    }

    @PostMapping("/api/visits/{opNumber}/vitals")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, UUID> record(@PathVariable String opNumber,
                                    @Valid @RequestBody VitalsRequest req,
                                    Authentication auth) {
        UUID id = service.record(opNumber, req, SecurityUtils.requireActorId(auth));
        return Map.of("id", id);
    }
}
