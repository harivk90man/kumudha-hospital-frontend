package com.hospital.management.platform.identity;

import com.hospital.management.platform.SecurityUtils;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse create(@Valid @RequestBody CreateUserRequest req,
                               Authentication auth) {
        return userService.createUser(req, SecurityUtils.requireActorId(auth));
    }

    @GetMapping("/{id}")
    public UserResponse getById(@PathVariable UUID id) {
        return userService.findById(id);
    }

    @GetMapping
    public Page<UserResponse> list(@PageableDefault(size = 20) Pageable pageable) {
        return userService.findAll(pageable);
    }

    @PutMapping("/{id}")
    public UserResponse update(@PathVariable UUID id,
                               @Valid @RequestBody UpdateUserRequest req,
                               Authentication auth) {
        return userService.updateUser(id, req, SecurityUtils.requireActorId(auth));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, Authentication auth) {
        userService.softDelete(id, SecurityUtils.requireActorId(auth));
    }

    @PatchMapping("/{id}/activate")
    public UserResponse activate(@PathVariable UUID id, Authentication auth) {
        return userService.activate(id, SecurityUtils.requireActorId(auth));
    }

    @PatchMapping("/{id}/deactivate")
    public UserResponse deactivate(@PathVariable UUID id, Authentication auth) {
        return userService.deactivate(id, SecurityUtils.requireActorId(auth));
    }

    @PostMapping("/{id}/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@PathVariable UUID id,
                               @Valid @RequestBody ChangePasswordRequest req,
                               Authentication auth) {
        userService.changePassword(id, req, SecurityUtils.requireActorId(auth));
    }
}
