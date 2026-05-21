package com.hospital.management.platform.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository  = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public UserResponse findById(UUID id) {
        return UserMapper.toResponse(requireUser(id));
    }

    @Transactional(readOnly = true)
    public Page<UserResponse> findAll(Pageable pageable) {
        return userRepository.findAllByDeletedAtIsNull(pageable)
                .map(UserMapper::toResponse);
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    public UserResponse createUser(CreateUserRequest req, UUID actorId) {
        if (userRepository.existsByEmployeeIdAndDeletedAtIsNull(req.employeeId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Employee ID already exists");
        }
        if (userRepository.existsByUsernameAndDeletedAtIsNull(req.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken");
        }
        if (userRepository.existsByMobileAndDeletedAtIsNull(req.mobile())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mobile number already registered");
        }

        User user = new User(
                req.employeeId(),
                req.fullName(),
                req.username(),
                req.mobile(),
                passwordEncoder.encode(req.initialPassword()),
                req.profileData(),
                actorId
        );

        user.setEmail(req.email());
        user.setDesignation(req.designation());
        user.setJoiningDate(req.joiningDate());
        if (req.departmentId() != null) {
            user.assignDepartment(req.departmentId());
        }

        return UserMapper.toResponse(userRepository.save(user));
    }

    public UserResponse updateUser(UUID id, UpdateUserRequest req, UUID actorId) {
        User user = requireUser(id);

        user.setFullName(req.fullName());
        user.setEmail(req.email());
        user.setDesignation(req.designation());
        user.setJoiningDate(req.joiningDate());
        user.setNotes(req.notes());
        if (req.departmentId() != null) {
            user.assignDepartment(req.departmentId());
        }
        if (req.profileData() != null) {
            user.updateProfile(req.profileData());
        }
        user.setUpdatedBy(actorId);

        return UserMapper.toResponse(user);
    }

    public void changePassword(UUID id, ChangePasswordRequest req, UUID actorId) {
        User user = requireUser(id);

        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Current password is incorrect");
        }

        user.changePassword(passwordEncoder.encode(req.newPassword()));
        user.setUpdatedBy(actorId);
    }

    public UserResponse activate(UUID id, UUID actorId) {
        User user = requireUser(id);
        user.activate();
        user.setUpdatedBy(actorId);
        return UserMapper.toResponse(user);
    }

    public UserResponse deactivate(UUID id, UUID actorId) {
        User user = requireUser(id);
        user.deactivate();
        user.setUpdatedBy(actorId);
        return UserMapper.toResponse(user);
    }

    public void invalidateTokens(UUID id) {
        requireUser(id).invalidateTokens();
    }

    public void softDelete(UUID id, UUID actorId) {
        User user = requireUser(id);
        user.softDelete(actorId);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    User requireUser(UUID id) {
        return userRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    // Exposed for AuthService without crossing package boundaries
    User requireByUsername(String username) {
        return userRepository.findByUsernameAndDeletedAtIsNull(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
    }

    User requireById(UUID id) {
        return userRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token"));
    }
}
