package com.hospital.management.patient.registration;

import com.hospital.management.platform.SecurityUtils;
import com.hospital.management.platform.web.PagedResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.data.web.SortDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/patients")
public class PatientController {

    private final PatientRegistrationService registrationService;
    private final PatientSearchService       searchService;

    public PatientController(PatientRegistrationService registrationService,
                             PatientSearchService searchService) {
        this.registrationService = registrationService;
        this.searchService       = searchService;
    }

    /** Register a new patient. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PatientRegistrationResponse register(@Valid @RequestBody PatientRegistrationRequest req,
                                                Authentication auth) {
        return registrationService.register(req, SecurityUtils.requireActorId(auth));
    }

    /**
     * Search patients by UHID prefix or mobile (contains).
     * Supports multi-column sorting: ?sort=lastName,asc&sort=dateOfBirth,desc
     * Unknown sort fields are silently ignored (injection-safe allowlist in service).
     */
    @GetMapping
    public PagedResult<PatientSearchResult> search(
            @RequestParam @NotBlank String q,
            @PageableDefault(size = 10)
            @SortDefault(sort = "uhid", direction = Sort.Direction.ASC)
            Pageable pageable) {
        return searchService.search(q.trim(), pageable);
    }

    /** Exact lookup by UHID — used by the patient profile page. */
    @GetMapping("/{uhid}")
    public PatientSearchResult getByUhid(@PathVariable String uhid) {
        return searchService.findByUhid(uhid.toUpperCase());
    }
}
