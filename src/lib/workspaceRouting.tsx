/* eslint-disable react-refresh/only-export-components */
import { useCallback } from 'react';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  Navigate as RouterNavigate,
  useLocation,
  useNavigate as useRouterNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateProps,
  type NavigateOptions,
  type To,
  type NavigateFunction,
} from 'react-router-dom';
export * from 'react-router-dom';

export function isDemoPath(pathname: string) {
  return /^\/demo(?:\/|$)/i.test(pathname);
}

// Existing workspace screens use /app targets. Keep those targets inside the
// current workspace; explicit enter/leave links use the router's Link directly.
export function workspaceTarget(to: To, demo: boolean): To {
  if (!demo) {
    return to;
  }
  const path = typeof to === 'string' ? to : to.pathname;
  if (!path) {
    return to;
  }
  const target =
    path === '/login' ? '/demo' : path.replace(/^\/app(?=\/|$|\?|#)/, '/demo');
  return typeof to === 'string' ? target : { ...to, pathname: target };
}

export function Link(props: LinkProps) {
  const demo = isDemoPath(useLocation().pathname);
  return <RouterLink {...props} to={workspaceTarget(props.to, demo)} />;
}
export function NavLink(props: NavLinkProps) {
  const demo = isDemoPath(useLocation().pathname);
  return <RouterNavLink {...props} to={workspaceTarget(props.to, demo)} />;
}
export function Navigate(props: NavigateProps) {
  const demo = isDemoPath(useLocation().pathname);
  return <RouterNavigate {...props} to={workspaceTarget(props.to, demo)} />;
}
export function useNavigate(): NavigateFunction {
  const navigate = useRouterNavigate();
  const demo = isDemoPath(useLocation().pathname);
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      return typeof to === 'number'
        ? navigate(to)
        : navigate(workspaceTarget(to, demo), options);
    },
    [navigate, demo],
  );
}
