# LoginPage (front-desk)

**File:** [LoginPage.tsx](LoginPage.tsx) · **Route:** `/frontdesk/login` · **Auth:** public

## Purpose
Sign-in screen for the receptionist + nurse roles. Two-pane layout: brand
panel on the left (lg+), credential form on the right. On success the
user is routed to `/frontdesk/dashboard` (or the `from` location if the
auth-guard redirected here). A doctor signing in here is bounced to
`/doctor/dashboard` so they can't accidentally land in the wrong portal.

## Sections

| Section | Where | Notes |
|---------|-------|-------|
| Brand panel (left) | inline | Logo + tagline + © Kumudha Hospital. Hidden on small screens. |
| Form card (right) | inline | Username + password + remember-me + submit. |
| Error banner | inline | Shown when `submitError` is set after a failed login. |

## Form
- `react-hook-form` + `zodResolver`
- Schema: `loginSchema` from [@/features/auth](../../../features/auth/schemas/loginSchema.ts)
- On submit: `useAuth().login(username, password)` → role check → `navigate(target, { replace })`
  - `user.role === 'doctor'` → `/doctor/dashboard`
  - `user.role === 'receptionist' | 'nurse'` → `/frontdesk/dashboard` (or `from`)

## Mock login hint
- Username `rec.*` / `reception*` → mock receptionist (Sita Krishnan)
- Username `nurse.*` → mock nurse (Beena Mathew)
- Anything else → mock doctor (would get bounced to /doctor)

## Common edit hotspots
- "Brand image" → constant `LOGO_SRC` at top of file. Asset path: `frontend/public/branding/kh-logo.jpeg`.
- "Login button copy / spinner" → submit `<Button>` near bottom of form.
- "Field styling" → constants `fieldClass` / `labelClass`. Move into a shared `<FormInput>` primitive (already exists at `@/components/form`) when this form is rebuilt.

## Related
- Hook: [useAuth](../../../features/auth/hooks/useAuth.ts)
- Schema: [loginSchema](../../../features/auth/schemas/loginSchema.ts)
- Mock auth: [authMocks.ts](../../../features/auth/__mocks__/authMocks.ts)

## Quirks / TODOs
- "Forgot password" is text-only — no flow yet (intentional; admin-reset only per BRD).
- Field styling is inline — when the form is rebuilt with `<FormInput>` primitives we can drop the `fieldClass` / `labelClass` constants.
