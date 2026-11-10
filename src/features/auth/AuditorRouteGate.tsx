import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
export function AuditorRouteGate() {
  const { user } = useAuth();
  const { pathname: rawPathname } = useLocation();
  let pathname = rawPathname.replace(/\/+$/, '');
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* Invalid paths fall through to the normal not-found route. */
  }
  if (user?.role === 'AUDITOR') {
    if (pathname.toLowerCase() === '/app/accountant')
      return <Navigate to="/app/transactions" replace />;
    if (pathname.toLowerCase().startsWith('/app/settings'))
      return <Navigate to="/app/businesses" replace />;
    const business = pathname.match(
      /^(\/app\/businesses\/[^/]+)\/(settings|governance)(\/|$)/i,
    );
    if (business) return <Navigate to={`${business[1]}/audit-trail`} replace />;
    const mutation = pathname.match(
      /^(\/app\/businesses\/[^/]+\/(?:expenses|income|mileage))\/(?:new|[^/]+\/edit)\/?$/i,
    );
    if (mutation) return <Navigate to={mutation[1]} replace />;
  }
  return <Outlet />;
}
