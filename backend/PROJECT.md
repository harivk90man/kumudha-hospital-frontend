# backend — Hospital Management System

## Purpose
Spring Boot 3.4 + Java 21 backend for the Hospital Management System. Feature-wise packaged under `com.hospital.management.<feature>` (see CLAUDE.md §2.1).

## How to run
```bash
# from backend/
./mvnw spring-boot:run            # or:  mvn spring-boot:run
./mvnw test                       # run tests
./mvnw clean package              # build executable jar -> target/hospital-management-0.0.1-SNAPSHOT.jar
java -jar target/hospital-management-0.0.1-SNAPSHOT.jar
```

App starts on port `8080` (override with `--server.port=…` or `SERVER_PORT` env var).

## Config constants
- `spring.application.name` — `hospital-management`
- `server.port` — `8080`

## DB tables used
None yet — persistence layer not wired in.

## Known issues
- No persistence (no JDBC / JPA starter) — add per-feature when first repository is introduced.
- No security starter — add when auth is in scope.
- No Maven wrapper (`mvnw`) yet — generate via `mvn -N wrapper:wrapper` if a pinned Maven version is wanted.

## Planned improvements
- [ ] Add Maven wrapper
- [ ] Add Spring Data JDBC + Flyway when first feature needs persistence
- [ ] Add OpenAPI (springdoc) once first endpoint lands
- [ ] Add Spring Security
- [ ] Add CI build (GitHub Actions)
