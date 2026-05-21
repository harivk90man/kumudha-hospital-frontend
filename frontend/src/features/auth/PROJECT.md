# Auth feature

Maps to schema v2 module **01-platform-tenancy** (app_user, role, permission).

## Purpose
Sign-in, session persistence, and the app-wide auth store. Single source for "who is logged in" across every role shell (doctor, pharmacist, lab tech, ...).

## How to run
- `useAuth()` — hook returning `{ doctor, isAuthenticated, login, logout }`.
- `useAuthStore` — Zustand store (persisted to `localStorage` under `hms-auth`).
- Login form: `loginSchema` + `LoginFormValues`.

## DB tables / entities (schema v2)
- `app_user`, `role`, `permission`

## Known issues / limitations
- Mock auth: any non-empty username + password ≥ 4 chars succeeds.
- `DoctorProfile` is the only profile type today. When a second role lands, generalise to `UserProfile` discriminated by `role`.

## Planned improvements
- [ ] Wire `login` to `POST /api/auth/login`; honour real JWT expiry.
- [ ] Add `fetchSession` (`GET /api/auth/me`) for refresh-on-load.
- [ ] Move JWT into `lib/http/httpClient` request interceptor.
- [ ] Generalise `DoctorProfile` into `UserProfile` once a second role exists.
