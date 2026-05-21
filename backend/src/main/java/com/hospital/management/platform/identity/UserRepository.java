package com.hospital.management.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Transactional(readOnly = true)
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsernameAndDeletedAtIsNull(String username);

    Optional<User> findByEmailAndDeletedAtIsNull(String email);

    Optional<User> findByIdAndDeletedAtIsNull(UUID id);

    Page<User> findAllByDeletedAtIsNull(Pageable pageable);

    boolean existsByUsernameAndDeletedAtIsNull(String username);

    boolean existsByEmployeeIdAndDeletedAtIsNull(String employeeId);

    boolean existsByMobileAndDeletedAtIsNull(String mobile);
}
