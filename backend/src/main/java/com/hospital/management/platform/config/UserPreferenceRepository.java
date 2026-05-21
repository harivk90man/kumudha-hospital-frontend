package com.hospital.management.platform.config;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface UserPreferenceRepository extends JpaRepository<UserPreference, UUID> {

    List<UserPreference> findByUserId(UUID userId);

    Optional<UserPreference> findByUserIdAndPreferenceKey(UUID userId, String key);
}
