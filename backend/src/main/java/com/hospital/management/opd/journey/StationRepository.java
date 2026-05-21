package com.hospital.management.opd.journey;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface StationRepository extends JpaRepository<Station, UUID> {

    Optional<Station> findByStationTypeAndDeletedAtIsNull(String stationType);

    List<Station> findByDeletedAtIsNull();
}
