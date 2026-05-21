package com.hospital.management.lab.sample;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface LabSampleRepository extends JpaRepository<LabSample, UUID> {

    Optional<LabSample> findBySampleBarcodeAndDeletedAtIsNull(String sampleBarcode);

    List<LabSample> findByLabOrderIdAndDeletedAtIsNull(UUID labOrderId);

    List<LabSample> findByStatusInAndDeletedAtIsNull(List<String> statuses);

    List<LabSample> findByReplacesSampleId(UUID replacesSampleId);
}
