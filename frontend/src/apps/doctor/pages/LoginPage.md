# LoginPage

**File:** [LoginPage.tsx](LoginPage.tsx) · **Route:** `/doctor/login` · **Auth:** public

## Purpose

Sign-in screen. Two-pane layout: brand panel on the left (lg+), credential
form on the right. On success, navigates to `/doctor/dashboard` (or the
`from` location if redirected here by the auth guard).

## Sections

| Section | Where | Notes |
|---------|-------|-------|
| Brand panel (left) | inline ~L57-80 | Logo + tagline + © Kumudha Hospital. Hidden on small screens. |
| Form card (right) | inline ~L82-156 | Username + password + remember-me + submit. |
| Error banner | inline ~L106-113 | Shown when `submitError` is set after a failed login. |

## Form

- `react-hook-form` + `zodResolver`
- Schema: `loginSchema` from [@/features/auth](../../../features/auth/schemas/loginSchema.ts)
- On submit: `useAuth().login(username, password)` → role check → `navigate(target, {replace})`

## Common edit hotspots

- "Brand image" → constant `LOGO_SRC` at L10. Asset path: `frontend/public/branding/kh-logo.jpeg`.
- "Login button copy / spinner" → ~L146-149.
- "Field styling" → constants `fieldClass` / `labelClass` (L12-14). Move into a shared `<Input>` primitive when more forms appear.

## Related

- Hook: [useAuth](../../../features/auth/hooks/useAuth.ts)
- Schema: [loginSchema](../../../features/auth/schemas/loginSchema.ts)
- Mock auth: [authMocks.ts](../../../features/auth/__mocks__/authMocks.ts) (any password works against mock)

## Quirks / TODOs

- "Forgot password" is text-only — no flow yet (intentional; admin-reset only per BRD).
- Field styling is inline — when the next form lands, extract to `components/form/`.
