package com.hospital.management.platform.lookup;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/lookups")
public class LookupController {

    private final AllergyLookupRepository allergyRepo;
    private final ChronicConditionLookupRepository conditionRepo;

    public LookupController(AllergyLookupRepository allergyRepo,
                            ChronicConditionLookupRepository conditionRepo) {
        this.allergyRepo   = allergyRepo;
        this.conditionRepo = conditionRepo;
    }

    @GetMapping("/allergies")
    public List<AllergyItem> allergies() {
        return allergyRepo.findAllByDeletedAtIsNull().stream()
                .map(a -> new AllergyItem(a.getId(), a.getAllergyCode(), a.getAllergyName(), a.getCategory()))
                .toList();
    }

    @GetMapping("/chronic-conditions")
    public List<ConditionItem> chronicConditions() {
        return conditionRepo.findAllByDeletedAtIsNull().stream()
                .map(c -> new ConditionItem(c.getId(), c.getConditionCode(), c.getConditionName(), c.getCategory()))
                .toList();
    }

    public record AllergyItem(UUID id, String code, String name, String category) {}
    public record ConditionItem(UUID id, String code, String name, String category) {}
}
