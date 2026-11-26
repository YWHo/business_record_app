import { Navigate, useLocation } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';
import { isDemoPath } from './lib/workspaceRouting';

export function WorkspaceApplication() {
  const { pathname } = useLocation();
  if (pathname === '/' && import.meta.env.MODE === 'demo') {
    return <Navigate to="/demo" replace />;
  }
  const demo = isDemoPath(pathname);
  return (
    <AuthProvider
      key={demo ? 'demo' : 'private'}
      mode={demo ? 'demo' : 'private'}
    >
      <App demo={demo} />
    </AuthProvider>
  );
}
