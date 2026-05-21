package com.hospital.management.platform.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Assigns a correlation ID to every request and records duration.
 * MDC keys: requestId, userId.
 * userId is populated here as "-" until JWT auth is wired (platform/identity sprint).
 */
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    static final String REQUEST_ID_HEADER = "X-Request-ID";
    static final String MDC_REQUEST_ID    = "requestId";
    static final String MDC_USER_ID       = "userId";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {

        String requestId = UUID.randomUUID().toString();
        long startMs      = System.currentTimeMillis();

        MDC.put(MDC_REQUEST_ID, requestId);
        MDC.put(MDC_USER_ID, "-"); // replaced by JWT filter once auth is implemented

        response.setHeader(REQUEST_ID_HEADER, requestId);

        log.info("→ {} {}", request.getMethod(), request.getRequestURI());

        try {
            chain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - startMs;
            log.info("← {} {} {}ms", response.getStatus(), request.getRequestURI(), duration);
            MDC.clear();
        }
    }
}
