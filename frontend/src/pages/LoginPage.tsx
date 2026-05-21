import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/feedback/Spinner';
import { AuroraBackground } from '@/components/visual/AuroraBackground';
import { cn } from '@/utils/cn';
import { homeForRole, loginSchema, useAuth, type LoginFormValues } from '@/features/auth';
import { HttpError } from '@/lib/http/httpError';

const LOGO_SRC = '/branding/kh-logo.jpeg';
const fieldClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';
const labelClass = 'text-xs font-medium text-muted-foreground';

const TAGLINES = [
  'Patient care starts here.',
  'Every role, one sign-in.',
  'Secure. Fast. Reliable.',
  'Your hospital, connected.',
];

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, user } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);

  // If already authenticated, go directly to the user's home.
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Rotating taglines with sequential fade.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTaglineVisible(false);
      window.setTimeout(() => {
        setTaglineIdx((i) => (i + 1) % TAGLINES.length);
        window.requestAnimationFrame(() => setTaglineVisible(true));
      }, 700);
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', remember: false },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    setSubmitError(null);
    try {
      const loggedInUser = await login(values.username, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && !from.endsWith('/login') ? from : homeForRole(loggedInUser.role);
      navigate(target, { replace: true });
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 401) {
          setSubmitError('Please check your login credentials.');
        } else {
          setSubmitError('Sorry, please contact your server admin.');
        }
      } else {
        setSubmitError('Please check your login credentials.');
      }
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[2fr_3fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <AuroraBackground />

        <div className="relative flex items-center gap-3">
          <img
            src={LOGO_SRC}
            alt="Kumudha Hospital logo"
            className="h-14 w-14 rounded-xl border border-white/20 bg-white object-contain p-1 shadow-card"
          />
          <div className="leading-tight">
            <div className="text-base font-semibold">Kumudha Hospital</div>
            <div className="text-xs opacity-80">Hospital Management</div>
          </div>
        </div>

        <div className="relative max-w-md space-y-4">
          <div className="relative min-h-[5rem]">
            <h1
              aria-live="polite"
              className={cn(
                'text-3xl font-semibold tracking-tight transition-opacity duration-700 ease-premium',
                taglineVisible ? 'opacity-100' : 'opacity-0',
              )}
            >
              {TAGLINES[taglineIdx]}
            </h1>
          </div>
          <p className="text-sm opacity-80">
            Sign in with your hospital credentials. You will be taken to your
            workspace automatically based on your role.
          </p>
        </div>

        <div className="relative text-xs opacity-70">© Kumudha Hospital</div>
      </div>

      {/* Form pane */}
      <div className="flex items-center justify-center p-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
        >
          {/* Mobile lockup */}
          <div className="flex items-center gap-3 lg:hidden">
            <img
              src={LOGO_SRC}
              alt="Kumudha Hospital logo"
              className="h-12 w-12 rounded-xl border bg-card object-contain p-1"
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Kumudha Hospital</div>
              <div className="text-xs text-muted-foreground">Sign in to continue</div>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Use your hospital credentials to continue.
            </p>
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {submitError}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Username *</span>
            <input
              autoComplete="username"
              {...register('username')}
              className={fieldClass}
              placeholder="your.username"
            />
            {errors.username && (
              <span className="text-xs text-danger">{errors.username.message}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>Password *</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className={fieldClass}
            />
            {errors.password && (
              <span className="text-xs text-danger">{errors.password.message}</span>
            )}
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" {...register('remember')} className="h-4 w-4" />
            Remember me on this device
          </label>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size="sm" label="Signing in" /> : <LogIn />}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Forgot password? Contact your hospital IT admin.
          </p>
        </form>
      </div>
    </div>
  );
}
