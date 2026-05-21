import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">404 — Not Found</h1>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">
        Go home
      </Link>
    </div>
  );
}
