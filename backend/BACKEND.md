# Backend Standards — Persistence, Schema, DTOs

> Extends [CLAUDE.md](../CLAUDE.md) §2 (Backend Rules — Java / Spring Boot).
> Link from CLAUDE.md once reviewed. Until then this file is a proposal — nothing here overrides CLAUDE.md.

This document governs the persistence layer (Spring Data JPA + JdbcTemplate), schema lifecycle (Flyway), and DTO / wire-type synchronization. It assumes the existing CLAUDE.md §2.1 rules (feature-wise packaging, camelCase identifiers, Java 21 Records for DTOs, constructor injection).

**Single sources of truth:**
- **DB schema** — Flyway migrations in `backend/src/main/resources/db/migration/`.
- **HTTP contract** — controller signatures, exported as `openapi.json` via springdoc.
- **Frontend types** — generated from `openapi.json`; never hand-written.

---

## 1. Schema Lifecycle — Flyway (single source of truth for DB)

### 1.1 Migration files
- Every schema change = one new file `V{n+1}__{snake_case_description}.sql` under `backend/src/main/resources/db/migration/`.
- Migration filenames are sequential and immutable. **Never edit an applied migration**, even in pre-data phase — keeps AI's habits correct once data exists.
- Repeatable migrations (views, functions) use `R__name.sql`. Avoid for table changes.

### 1.2 Stage-aware policy

| Phase | Trigger | `flyway clean` allowed | Migration immutability | Breaking change pattern |
|---|---|---|---|---|
| **Pre-data** (now) | No `prod` profile, no teammate runs the app | YES | Immutable (habit) | Edit-forward — write a new migration that drops / re-creates the column |
| **Post-data** | First time `application-prod.yml` is committed OR a teammate clones the repo | BANNED | Strictly immutable | Expand-contract (see §1.4) |

The cutover signal is the merge of either: (a) an `application-prod.yml`, or (b) a CI deploy step. Once either lands, this document MUST be updated and §1.4 takes effect.

### 1.3 Pre-data workflow (today)
While iterating on schema during testing:
1. Write `V{n+1}__add_column_foo.sql` (or `__drop_column_foo.sql`, `__change_type_foo.sql`).
2. Either `flyway migrate` (incremental) or `flyway clean && flyway migrate` (full reset — fine in this phase).
3. Walk the §5 checklist to update entity, DTO, frontend types.

If a schema change makes a previous migration redundant, **do not delete or edit it** — add a new one that supersedes it. The historical trail stays intact.

### 1.4 Post-data: expand-contract patterns
| Change | Steps |
|---|---|
| Add NOT NULL column | 1) Add nullable, 2) backfill via migration, 3) set NOT NULL |
| Rename column | 1) Add new column, 2) dual-write from app, 3) backfill, 4) switch reads, 5) drop old |
| Change column type (narrowing) | 1) Add new typed column, 2) backfill, 3) switch code, 4) drop old |
| Drop column | 1) Stop writing (deploy), 2) stop reading (deploy), 3) drop column |

### 1.5 Validation (always on)
- `spring.jpa.hibernate.ddl-auto=validate` — app refuses to start if entity ↔ DB drifts.
- `flyway validate` runs in CI — build fails if any applied migration was modified.
- `hbm2ddl.auto=create`, `create-drop`, and `update` are **banned** in any committed config.

---

## 2. JPA Entities

### 2.1 Mapping rules
- **Fetch type:** `FetchType.LAZY` on every `@OneToMany`, `@ManyToMany`, `@ManyToOne`. `EAGER` is banned.
- **Direction:** `@OneToMany` is always bidirectional with `mappedBy`. Unidirectional `@OneToMany` is banned (forces a join table or inefficient UPDATEs).
- **Collection type:** `Set` for `@ManyToMany` and `@OneToMany`. `List` only when ordering is semantically meaningful (with `@OrderColumn`).
- **Not Records.** JPA requires a no-arg constructor and mutable state for proxies. Entities are plain classes with a `protected` no-arg constructor. (DTOs stay Records per CLAUDE.md §2.1.)
- **Lombok:** `@Getter` is fine. `@Setter` is fine for mutable fields. **`@Data` and `@EqualsAndHashCode` are banned on entities** — they break with lazy-loaded fields and Hibernate proxies.
- **`equals` / `hashCode`:** Manual, using a stable business key (e.g. `mrn`, `email`, slug). **Never** use the auto-generated `id` — it's null for transient entities and changes on persist, breaking `Set` membership.

### 2.2 ID generation
- `GenerationType.SEQUENCE` with `allocationSize = 50` for any table that will see batch inserts.
- `GenerationType.IDENTITY` only for low-volume tables (config, `*_lookup`) — IDENTITY disables JDBC batch inserts.
- Business keys (`mrn`, `email`, etc.) are separate columns with a UNIQUE constraint, never the primary key.

### 2.3 Naming bridge (camelCase ↔ snake_case)
- Java identifiers stay camelCase (CLAUDE.md §2.1).
- DB columns are snake_case via Spring Boot's default `PhysicalNamingStrategy = CamelCaseToUnderscoresNamingStrategy`. Automatic — no `@Column` annotations needed for normal fields.
- Use `@Column("explicit_name")` only when the auto-mapping wouldn't produce the desired name (rare; document the reason in a one-line comment).
- JSON wire format stays camelCase (Jackson default with Records). `@JsonNaming(SnakeCaseStrategy)` is **banned** (already in CLAUDE.md §2.1).

---

## 3. Queries

### 3.1 N+1 defense
- Read queries that need related data use `JOIN FETCH` (JPQL) or `@EntityGraph`. Lazy-loading inside a loop is banned.
- **DTO projections** (constructor expression or interface projection) for reports and list views — never fetch a full entity to read 2 columns.
- Hot paths carry a test that asserts query count using `datasource-proxy` or `hypersistence-utils`. Regressions fail CI.

### 3.2 Read-only optimization
- All query repository methods carry `@Transactional(readOnly = true)`. Hibernate skips dirty checking (~30 % faster).
- `spring.jpa.open-in-view=false` — **non-negotiable**. The default hides lazy-load bugs into the view layer.

---

## 4. JdbcTemplate

### 4.1 Usage rules
- Only `NamedParameterJdbcTemplate`. Positional `?` + `Object[]` is banned.
- SQL is never string-concatenated. Sort / filter column names come from a code-level allowlist (ties to CLAUDE.md §6 list-endpoint rules).
- Each repository has a `static final RowMapper<T>` field. `BeanPropertyRowMapper` is banned — reflection-based, silently drifts when columns are renamed.

### 4.2 Schema-aware RowMapper test
An integration test (Testcontainers + the project's DB engine) instantiates every `RowMapper` against the real schema and asserts every referenced column exists. This replaces "manually check column names" — drift fails CI.

### 4.3 Mixing JdbcTemplate with JPA in one transaction
- Call `entityManager.flush()` before any raw JdbcTemplate query in the same transaction. Otherwise pending JPA changes aren't visible to JDBC.
- Every choice of JdbcTemplate over JPA includes a one-line `// reason:` comment: `N+1 unfixable`, `bulk batch`, `projection shape`, or `5+ table join`. Otherwise default to JPA.

---

## 5. DTOs and Frontend Type Sync

### 5.1 DTO rules
- Controllers **never** return JPA entities. Always a Java Record DTO (CLAUDE.md §2.1).
- Request DTOs are separate from response DTOs. Sharing one DTO for both directions is banned — they evolve differently and the shared shape becomes a god type.
- A mapper component (static Record method or MapStruct) converts entity ↔ DTO. Mapper logic stays inside the feature package.

### 5.2 OpenAPI codegen (the drift-killer)
1. `springdoc-openapi-starter-webmvc-ui` exports `openapi.json` from controller signatures at build time.
2. Frontend build step runs `openapi-typescript` → regenerates `frontend/src/lib/apiTypes.ts`.
3. Frontend feature code imports types from `apiTypes.ts`. **Hand-writing a DTO type in TS is banned.**
4. zod schemas (CLAUDE.md §3.9) live next to forms. A unit test round-trips a fixture against the generated DTO type to catch zod ↔ DTO drift.

---

## 6. Transactions
- `@Transactional` lives on the **service** layer. Not on controllers. Not on repositories.
- Default propagation is `REQUIRED`. Anything else (`REQUIRES_NEW`, `NESTED`, etc.) needs a one-line `// reason:` comment.
- `@Transactional(readOnly = true)` for query methods (see §3.2).

---

## 7. Bulk Operations
- `spring.jpa.properties.hibernate.jdbc.batch_size=50`
- `spring.jpa.properties.hibernate.order_inserts=true`
- `spring.jpa.properties.hibernate.order_updates=true`
- Bulk inserts / updates > 100 rows: use JdbcTemplate `batchUpdate`. JPA bulk is for ≤ 100.

---

## 8. Hibernate Config Defaults
- `spring.jpa.open-in-view=false`
- `spring.jpa.hibernate.ddl-auto=validate`
- `spring.jpa.properties.hibernate.generate_statistics=true` in the `test` profile, off in prod.
- Second-level cache: **off** by default. Per-entity opt-in requires justification in the feature's `PROJECT.md`.
- `EntityManager` is never injected into services. Repositories own persistence; services orchestrate.

---

## 9. The Schema-Change Checklist
AI walks this in order for any column add / change / drop:

1. Write the Flyway migration `V{n+1}__*.sql`.
2. Pre-data phase: optionally `flyway clean && flyway migrate`.
3. Update the JPA entity.
4. Update DTO Records (request + response).
5. Update entity ↔ DTO mapper.
6. Update service + controller validation (`@Valid`, request / response signatures).
7. `./mvnw verify` — `hbm2ddl validate` + tests catch backend drift.
8. Backend rebuild emits new `openapi.json`.
9. Frontend codegen → `apiTypes.ts` refreshes.
10. Update zod schema + form fields in the feature.
11. `pnpm tsc --noEmit` + frontend tests.
12. Update the feature's `PROJECT.md` schema bullets (one line per column with the migration version that introduced it).

---

## 10. Pre-Flight Check (extends CLAUDE.md §5)
Before any persistence-touching change, AI must explicitly confirm:
1. "I am adding a new Flyway migration, not editing an applied one."
2. "I am using LAZY fetch, bidirectional collections, `Set` over `List`, and a business-key `equals` / `hashCode`."
3. "The DTO crosses the controller boundary, not the entity."
4. "If I'm using JdbcTemplate, I have a `// reason:` comment justifying it over JPA."

---

## 11. Open Questions / To Decide
- **DB engine.** Postgres assumed for `CamelCaseToUnderscoresNamingStrategy` examples; MySQL works identically. Pick one and pin in `pom.xml` before §4.2 RowMapper tests are written.
- **MapStruct vs. hand-written mappers.** Hand-written Record methods are simpler; MapStruct scales better past ~5 fields. Defer until first feature with non-trivial mapping lands.
- **datasource-proxy vs. hypersistence-utils** for query-count assertions. Either works; pick one when §3.1 tests are first introduced.
- **Type codegen tool.** `openapi-typescript` (types only, lightweight) vs. `orval` (types + ready-made TanStack Query hooks). `openapi-typescript` is the smaller commitment and aligns with CLAUDE.md §3.5 (features still own their `<feature>Api.ts` wrappers).
