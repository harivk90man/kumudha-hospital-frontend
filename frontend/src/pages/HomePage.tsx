import { Link } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center">
        <Stethoscope className="h-12 w-12 text-primary" />
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Hospital Management System</h1>
          <p className="mt-2 text-muted-foreground">Frontend scaffold ready.</p>
        </div>
        <Button asChild>
          <Link to="/login">Get started</Link>
        </Button>
      </div>
    </div>
  );
}
