package com.hospital.management.platform.web;

import org.springframework.data.domain.Pageable;

import java.util.List;

/**
 * Uniform paginated response envelope for all list endpoints.
 * Used with JdbcTemplate queries where Spring's PageImpl is not available.
 */
public record PagedResult<T>(
        List<T> content,
        int     page,
        int     size,
        long    totalElements,
        int     totalPages
) {
    public static <T> PagedResult<T> of(List<T> content, Pageable pageable, long totalElements) {
        int totalPages = pageable.getPageSize() == 0
                ? 1
                : (int) Math.ceil((double) totalElements / pageable.getPageSize());
        return new PagedResult<>(
                content,
                pageable.getPageNumber(),
                pageable.getPageSize(),
                totalElements,
                totalPages);
    }

    public static <T> PagedResult<T> empty(Pageable pageable) {
        return new PagedResult<>(List.of(), pageable.getPageNumber(), pageable.getPageSize(), 0, 0);
    }
}
