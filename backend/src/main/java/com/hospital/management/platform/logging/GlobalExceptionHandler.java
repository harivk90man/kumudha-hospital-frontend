package com.hospital.management.platform.logging;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex,
                                                          HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + " " + e.getDefaultMessage())
                .collect(Collectors.joining(", "));

        log.warn("VALIDATION_FAILED path={} errors={}", request.getRequestURI(), message);

        return ResponseEntity.badRequest().body(new ErrorResponse(
                MDC.get(RequestLoggingFilter.MDC_REQUEST_ID),
                HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                message,
                request.getRequestURI(),
                OffsetDateTime.now()
        ));
    }

    /**
     * Handles ResponseStatusException (thrown by service layer for 4xx/5xx).
     * 4xx — expected client errors, logged at WARN with no stack trace.
     * 5xx — unexpected server errors, logged at ERROR with stack trace.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex,
                                                              HttpServletRequest request) {
        int status = ex.getStatusCode().value();
        String reason = ex.getReason() != null ? ex.getReason() : ex.getMessage();

        if (status >= 500) {
            log.error("SERVER_ERROR path={} status={} error={}", request.getRequestURI(), status, reason, ex);
        } else {
            log.warn("CLIENT_ERROR path={} status={} error={}", request.getRequestURI(), status, reason);
        }

        return ResponseEntity.status(status).body(new ErrorResponse(
                MDC.get(RequestLoggingFilter.MDC_REQUEST_ID),
                status,
                HttpStatus.resolve(status) != null ? HttpStatus.resolve(status).getReasonPhrase() : "Error",
                reason,
                request.getRequestURI(),
                OffsetDateTime.now()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleAll(Exception ex, HttpServletRequest request) {
        log.error("UNHANDLED_ERROR path={} error={}", request.getRequestURI(), ex.getMessage(), ex);

        return ResponseEntity.internalServerError().body(new ErrorResponse(
                MDC.get(RequestLoggingFilter.MDC_REQUEST_ID),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal server error",
                "An unexpected error occurred",
                request.getRequestURI(),
                OffsetDateTime.now()
        ));
    }
}
