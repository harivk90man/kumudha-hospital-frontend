import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { QueryProvider } from './providers/QueryProvider';
import { PreferencesProvider } from './providers/PreferencesProvider';

export function App() {
  return (
    <PreferencesProvider>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </PreferencesProvider>
  );
}
