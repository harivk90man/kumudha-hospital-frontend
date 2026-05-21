# logging — Feature

## Package
[platform](../MODULE.md)

## Java classes
- `RequestLoggingFilter` — servlet filter; assigns UUID correlation ID per request; puts `requestId` + `userId` into MDC; logs `→ METHOD /path` and `← status duration`
- `HmsLogger` — typed facade for all business event logging; expand with a new static method per event as each module is implemented; never use raw `log.info()` for business events
- `GlobalExceptionHandler` — `@RestControllerAdvice`; catches validation errors (400) and unhandled exceptions (500); logs WARN/ERROR with requestId
- `ErrorResponse` — record returned by the exception handler to the client

## Log config
`src/main/resources/logback-spring.xml`
- File appender only — console intentionally off
- Rolling: daily + 50 MB cap, 30 days history, 1 GB total cap
- Root level: ERROR (framework noise suppressed)
- `com.hospital.management`: INFO (business events + request in/out)
- SQL logging (Hibernate + JdbcTemplate): DEBUG/TRACE in `dev` profile only

## MDC keys
| Key | Set by | Value |
|---|---|---|
| `requestId` | `RequestLoggingFilter` | UUID per HTTP request |
| `userId` | `RequestLoggingFilter` (placeholder `-`) → JWT filter once auth is built | Authenticated user UUID |

## Business events (expand as modules are implemented)
See `HmsLogger.java` — one static method per named event.
Current: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `PASSWORD_CHANGED`

## Known constraints
- PII masking deferred — add to `HmsLogger` methods once app is complete
- `userId` MDC key is `-` until JWT auth sprint (platform/identity)
- `ErrorResponse` record may move to a shared DTO package if it grows beyond error use
