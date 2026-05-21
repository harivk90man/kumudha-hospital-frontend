# Project Standards & Architecture (Generic Template)

> Drop this into the root of any new Java/Spring Boot + React/TypeScript project as `CLAUDE.md`.
> Replace `com.example` with the project's base package and adjust the framework names where noted.

## 1. Architectural Mandate: "Long-Term First"
- **No Quick Fixes:** Every change must consider the 6-month impact. Avoid "hacks" or temporary variables.
- **POJO Lifecycle:** Reuse existing POJOs/Records if they logically fit. If a POJO starts feeling like a "Swiss Army Knife," create a new, specific one.
- **Root-cause over symptom:** If a bug surfaces in layer A but originates in layer B, fix B. Document why if a workaround is unavoidable.

## 2. Backend Rules — Java / Spring Boot

### 2.1 Code Organization & Style
- **Package Strategy:** STRICT Feature-wise packaging.
  - *Correct:* `com.example.portfolio.PortfolioController`, `com.example.portfolio.PortfolioService`.
  - *Incorrect:* `com.example.controller.PortfolioController`, `com.example.service.PortfolioService`.
- **Typing:** Use Java 21 Records for DTOs. Ensure all fields are explicitly typed. No raw types, no `Object` bags.
- **Decomposition:** Methods > 20 lines must be split. Use Javadoc for all public methods.
- **Constructor injection only.** No field injection (`@Autowired` on fields). Records or `final` fields + constructor.
- **Exceptions:** Throw domain-specific exceptions at boundaries. Don't catch-and-swallow; don't catch-and-log-and-rethrow.
- **Identifier casing — camelCase by default.** Variable names, method names, parameter names, record components, DTO field names, JSON wire fields: all camelCase. The only exceptions are language-mandated:
  - **PascalCase** for: class names, interface names, enum type names, record types, annotation types.
  - **SCREAMING_SNAKE_CASE** for: enum constants and `static final` compile-time constants only.
  - **lowercase.dot** for: package names (Java convention — `com.example.patients`).
  - **No snake_case in Java code, ever.** Records, DTOs, request/response bodies all stay camelCase. JSON serialization stays camelCase (Jackson default with records — do NOT add `@JsonNaming(SnakeCaseStrategy)` or `application.properties` overrides). DB columns are the **only** place snake_case is allowed — that's a physical-schema convention, not a Java identifier choice. The repository layer maps camelCase Java fields ↔ snake_case columns explicitly (`@Column("first_name")`, `RowMapper`, or JdbcTemplate column aliases).

### 2.2 List Endpoints — Sorting & Pagination
- **Sorting and pagination are ALWAYS server-side.** Every list endpoint accepts `page`, `limit`, and `sort` and returns only the requested page. Never return the full result set and rely on the client to slice it.
- Sort/filter wire format and column-allowlist rules are defined in §6 (API Conventions). All list endpoints must conform.

## 3. Frontend Rules — React / TypeScript

### 3.1 Code Organization & Style
- **Stack (fixed):** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + axios + lucide-react + react-hook-form + zod. These are non-negotiable. Proposing alternatives (other state libraries, icon sets, CSS systems, form libraries, HTTP clients) requires explicit user approval — never silently introduce a substitute.
- **Language:** TypeScript only. No plain `.js` / `.jsx` source files in the frontend — every component, hook, util, and config file must be `.ts` / `.tsx` and pass `tsc --noEmit`. `strict: true` in `tsconfig.json` is non-negotiable.
- **Folder Structure:** Feature-Sliced Design (FSD). Feature logic stays in `src/features/[FeatureName]`.
- **Strict Typing:** No `any`. Use Interfaces that mirror Java POJOs/Records.
- **Components:** Functional components only. Small, pure functions for logic. Use TSDoc.
- **State:** Co-locate state with the feature. Lift only when genuinely shared.
- **Filenames are self-descriptive.** The filename must describe what the file exports — path context (the parent folder) does NOT excuse a generic filename. A reader should predict the exports from the filename alone.
  - *Bad:* `lib/http/client.ts`, `features/patients/api.ts`, `store/data.ts`, `utils/helpers.ts`, `services/manager.ts`.
  - *Good:* `lib/http/httpClient.ts`, `features/patients/patientsApi.ts`, `store/uiShellStore.ts`, `utils/formatCurrency.ts`.
  - **Case follows the primary export:** PascalCase `.tsx` only for files whose default/primary export is a React component (`PatientForm.tsx`, `HomePage.tsx`). camelCase `.ts(x)` for everything else (`httpClient.ts`, `useDebounce.ts`, `patientsStore.ts`).
  - **Generic identifiers** (`client`, `helper`, `service`, `manager`, `data`, `utils`, `api`, `store`, `types` as the *whole* filename) are forbidden — they require a qualifier (`patientsApi.ts`, `patientsStore.ts`, `patientsTypes.ts`).
  - **`index.ts` is the only exempt name** — it's a re-export barrel; its purpose is named by the folder.
  - **Tests** sit next to the source with `.test.ts(x)` suffix (`httpClient.test.ts` next to `httpClient.ts`).
- **Identifier casing — camelCase by default.** Variables, functions, parameters, object properties, hook names, store actions, JSON request/response fields exchanged with the backend: all camelCase. The only exceptions are language- or framework-mandated:
  - **PascalCase** for: class names, type aliases, interfaces, enums, generic type parameters (`T`, `TData`), and React component names (mandatory — JSX uses casing to distinguish components from HTML elements: `<button>` is HTML, `<Button>` is a component).
  - **SCREAMING_SNAKE_CASE** for: top-level compile-time constants only (e.g. `const MAX_RETRIES = 3`, `const API_VERSION = 'v1'`). Module-level config that isn't truly constant stays camelCase.
  - **No snake_case anywhere in TS code.** If the backend ever returns snake_case JSON (it shouldn't — backend §2.1 forbids it), transform at the boundary in `<feature>Api.ts`. Feature code touches camelCase POJOs only.
  - **No kebab-case in TS code.** Allowed only in non-code contexts: filenames inside `components/ui/` (shadcn convention — `button.tsx`), CSS class names, URL paths, HTML attributes.

### 3.2 Styling & Theming — Tailwind CSS (Single Source of Truth)
- **Tailwind CSS is the only styling system.** No SCSS, no CSS Modules, no CSS-in-JS (styled-components / emotion), no inline `style={{...}}` except for values genuinely computed from runtime data (e.g. progress bar width from a percent).
- **All theme tokens live in `tailwind.config.ts`** — colors, spacing, typography, radii, shadows, breakpoints, z-index scale. This is the §3.2 single source of truth. Changing a token there MUST cascade to the entire app with no other edits.
- **`frontend/src/styles/globals.css` holds only:** `@tailwind base/components/utilities` directives + the `:root` CSS variables that shadcn/ui consumes for theme tokens. No component CSS, no utility classes, no overrides.
- **Components use Tailwind classes via `className`**, composed with `cn()` (clsx + tailwind-merge) from `frontend/src/utils/cn.ts`. Never concatenate classNames with `+` or template literals.
- **Reusable component variants use `cva`** (class-variance-authority) — e.g. `<Button variant="primary" size="lg">`. Never fork a component to make a variant.
- **No magic colors, no magic spacing.** If a component "needs" a one-off color or spacing value, add the semantic token to `tailwind.config.ts` first. Arbitrary values (`bg-[#abc123]`, `p-[13px]`) are forbidden except for genuinely dynamic runtime values.

### 3.3 Shared Component Library — Single Source of Truth
- **Reusable UI primitives live in `frontend/src/components/`** (e.g. `components/Button/`, `components/Input/`, `components/Modal/`, `components/datatable/`).
- **shadcn/ui is the seed library.** Primitives are added via `npx shadcn add <name>`, which copies the source into `frontend/src/components/ui/`. You own the source — edit it freely (still respecting the single-source-of-truth rule below). Do NOT install `@shadcn/ui` or any "shadcn package" — there is none; shadcn is a code generator, not a runtime dependency.
- Features import from `frontend/src/components/`; they do NOT redefine their own `Button`, `Input`, `Card`, etc.
- Restyling a primitive in `frontend/src/components/` MUST reflect everywhere it's used. If a feature needs a variant, add a `variant` prop to the shared component using `cva` — do not fork it into the feature folder.

### 3.4 List Views — No Client-Side Filtering / Sorting / Pagination
- **No client-side filtering, sorting, or pagination** for any list backed by a server endpoint — always round-trip to the server.
- This applies even for "small" lists: the moment a list is server-backed, it follows the §6 contract.

### 3.5 HTTP Client — axios (Single Source of Truth)
- **axios is the only HTTP library.** No `fetch`, no `ky`, no `ofetch`, no `got`, no other client. Features import the shared `httpClient` from `@/lib/http/httpClient` — they NEVER `import axios` directly, never call `fetch`, never construct their own instance.
- **One configured `axios` instance** lives in `frontend/src/lib/http/httpClient.ts` and is the single place that owns: `baseURL` (from `VITE_API_BASE_URL`), default headers (`Accept: application/json`), timeout, request interceptor (auth token injection), response interceptor (error normalisation → `HttpError`), and any retry policy. Adding a new header (`X-Tenant-Id`, `Authorization`, correlation ID, etc.) must be a one-line change in this file and cascade to every request automatically.
- **`httpClient` is exposed as typed methods** (`get<T>`, `post<T>`, `put<T>`, `patch<T>`, `delete<T>`) that return the unwrapped data — `T`, not `AxiosResponse<T>`. Features should not have to remember to `.data` everywhere. If a feature genuinely needs response headers (e.g. pagination via `X-Total-Count`), expose a separate typed helper in `lib/http/` rather than leaking the raw axios instance.
- **Features expose typed wrappers in `features/<x>/api.ts`** — e.g. `export const getPatients = (params: PatientQuery) => httpClient.get<Patient[]>('/patients', { params })`. These return typed POJOs and do not configure transport-level concerns.
- **Errors are normalised** in the response interceptor: every non-2xx response AND every network/timeout error becomes an `HttpError` with `{ status, statusText, data, url }`. Status `0` is reserved for network/timeout failures. Components and stores catch `HttpError` only — they MUST NOT reference `AxiosError`.
- **Cancellation uses `AbortSignal`** passed via `{ signal }` config (TanStack Query already supplies one to `queryFn`). Do NOT use the legacy `CancelToken` API.

### 3.6 Folder Structure (Frontend)

```
frontend/src/
├── main.tsx              # bootstrap
├── App.tsx               # root component
├── routes.tsx            # route table
├── env.d.ts              # ambient env types
│
├── features/             # FSD slices — ALL domain logic lives here
│   └── [FeatureName]/
│       ├── [FeatureName]Page.tsx       # screen entry (mandatory)
│       ├── [featureName]Api.ts         # typed wrappers over lib/http/httpClient (§3.5)
│       ├── components/                 # feature-specific UI
│       ├── hooks/                      # feature-specific hooks
│       ├── [featureName]Store.ts       # feature-local Zustand store (optional)
│       ├── [featureName]Types.ts       # feature-local types (optional)
│       ├── __mocks__/                  # API mocks for THIS feature only
│       ├── PROJECT.md                  # AI context per §4
│       └── index.ts                    # public surface of the slice
│
├── components/           # shared UI primitives — single source of truth (§3.3)
│   ├── ui/               # shadcn-generated primitives (Button, Input, Dialog, ...)
│   ├── form/             # form-composition wrappers (rhf-bound Field, FormSection, ...)
│   ├── data-display/     # Table, datatable/, Stat, Badge, ...
│   ├── feedback/         # Toast, Skeleton, EmptyState, StatusPill, ...
│   ├── overlay/          # Modal, Tooltip, Dropdown, ... (often re-exports of ui/)
│   ├── layout/           # Card, Tabs, Segmented, ...
│   ├── icons/            # wrappers for icons NOT in lucide-react (rare)
│   └── index.ts
│
├── lib/                  # cross-cutting INFRA (not business logic)
│   ├── http/             # shared HTTP client (§3.5): httpClient, httpError, queryKeys
│   └── ws/               # shared WebSocket client (if used)
│
├── hooks/                # cross-cutting hooks (used by 2+ features only)
├── store/                # global APP-SHELL state only (modal manager, toasts, sidebar)
├── providers/            # context providers (theme, auth, query client)
├── layouts/              # page shells (AuthLayout, AppLayout, ...)
├── pages/                # ONLY non-feature shells (Home, NotFound, ComponentsGallery)
├── types/                # truly global types ONLY (api envelope, ids, money)
├── utils/                # pure helpers (cn, format, math, string) — NOT a junk drawer
├── config/               # build-time / app-level constants
├── styles/               # globals.css (Tailwind directives + shadcn CSS vars) — §3.2
└── assets/               # global static assets only
```

**Folder rules (enforced):**
- **Fixed feature-slice shape.** Every feature MUST expose `[FeatureName]Page.tsx`, `api.ts`, `components/`, `index.ts`, `PROJECT.md`. Add `hooks/`, `store.ts`, `types.ts`, `__mocks__/` only when actually needed. A slice must be deletable with one `rm -rf`.
- **Mocks live with the feature.** Never create a top-level `src/mocks/` — it cross-cuts features and rots when a feature is renamed or removed. Use `features/<x>/__mocks__/`.
- **Types belong to a feature** unless used by 2+ features. Do NOT create a global `types/domain.ts` — it always grows into a god file (the §1 "Swiss Army Knife" anti-pattern).
- **`store/` is app-shell state only** (modals, toasts, sidebar collapse, theme mode). Feature state goes in `features/<x>/store.ts`.
  - **Lifting rule:** state moves to global `store/` only when **2+ features read or write it**. One feature consuming + one feature passively displaying does NOT count — pass props instead. Lifting is a deliberate PR with the second consumer landing in the same diff; never lift "in anticipation" of a future caller.
  - **Reverse rule:** if a refactor leaves a global store with only one consumer, push it back down into that feature. Global `store/` does not accumulate dead weight.
- **`utils/` holds pure, stateless helpers only** (`cn`, `format`, `math`, `string`). Anything async, stateful, or business-rule-shaped goes to `lib/` or into the owning feature.
- **`pages/` is reserved for non-feature shells** (404, splash, gallery). Domain screens live in `features/<x>/<x>Page.tsx` and are mounted by `routes.tsx`.
- **Per-feature assets stay in the feature.** Only truly global assets (logo, favicon, fonts) belong in top-level `assets/`.
- **Component primitives are grouped by category**, not dumped flat. Once `components/` has more than ~10 entries, the subfolders above are mandatory.

### 3.7 State Management — Zustand (Single Source of Truth)
- **Zustand is the only state library.** No Redux, no Jotai, no Recoil, no MobX, no Context-as-store, no `useReducer` for state shared across components.
- §3.6 governs *where* a store lives (global `store/` vs `features/<x>/store.ts`); §3.7 governs *how* it's written. Both apply.
- **One store per concern**, not a single mega-store. Within a store, the slices pattern is allowed for grouping related state.
- **Components subscribe via selectors** — `useStore(s => s.value)`, never `useStore()` to grab the whole state. Whole-state subscriptions cause unnecessary re-renders and are a code-review failure.
- **Persistence (localStorage / sessionStorage) only via Zustand's `persist` middleware.** Never hand-roll `useEffect` to sync state to storage.
- **Async actions live inside the store** as methods that call the §3.5 HTTP client. Components do not orchestrate async state by hand.
- **Server cache state is NOT a Zustand concern.** Use TanStack Query (react-query) for server data — Zustand holds client/UI state only. (TanStack Query is part of the implicit stack — add it during init.)

### 3.8 Icons — Lucide React (Single Source of Truth)
- **All icons come from `lucide-react`.** No `react-icons`, no Heroicons, no Material icons, no Font Awesome, no per-icon `.svg` files imported into components, no inline SVG paste.
- **Direct import per icon** — `import { Search, Trash2 } from 'lucide-react'`. This tree-shakes cleanly; barrel-importing the whole library is forbidden.
- **If a needed icon doesn't exist in lucide,** add a wrapper in `frontend/src/components/icons/` that renders the SVG with the same `LucideProps` interface (size, color, strokeWidth, className). Never mix a second icon library into the project — even for one icon.
- **Sizing and color use Tailwind classes** — `<Search className="h-4 w-4 text-muted-foreground" />`. Avoid passing magic numbers to `size`/`color` props; theming must stay centralized in `tailwind.config.ts` tokens.

### 3.9 Forms — react-hook-form + zod (Single Source of Truth)
- **All forms use `react-hook-form` for state and `zod` for schema validation.** No hand-rolled `useState` form state for anything beyond a single search input. No Formik, no Final Form, no Yup.
- **Schema is the source of truth for both validation AND types.** Define `const schema = z.object({...})`, derive `type FormValues = z.infer<typeof schema>`, and pass `zodResolver(schema)` to `useForm`. Never duplicate field shapes between a TS interface and a validation schema.
- **Bind shadcn `Input`/`Select`/etc. via `Controller` or `register`** through the wrappers in `frontend/src/components/form/`. Features should not wire `react-hook-form` against raw shadcn primitives directly — that duplicates boilerplate and drifts.
- **Submit handlers call the §3.5 HTTP client** via the feature's `api.ts`. Validation errors map to `setError(field, ...)`; transport errors map to a toast or form-level error — never both for the same failure.
- **Schemas live with the feature** — `features/<x>/schemas/` or alongside the form component — never in a global `schemas/` folder (same reasoning as §3.6 types rule).

## 4. Package Documentation — `PROJECT.md` Convention
Every package has a `PROJECT.md` at its root. This is the AI context file committed to the repo.

**When working inside any package:**
- Read its `PROJECT.md` first before making any changes.

**When creating a new package:**
- Create a `PROJECT.md` alongside it covering: purpose, how to run, DB tables used, config constants, known issues, and planned improvements.

**What PROJECT.md must contain:**
- Purpose and strategy/logic of the package
- How to run (commands, config constants to change)
- DB tables and queries used
- Known issues and limitations
- Planned improvements (as a checklist)

## 5. Mandatory Pre-Flight Check
Before implementing any task, you must explicitly confirm:
1. "I am using feature-wise segregation for this change."
2. "I have checked for existing POJOs to reuse."
3. "This solution is built for long-term maintainability, not a quick fix."