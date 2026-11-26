import { Link } from 'react-router-dom';

// Deliberately crosses the workspace boundary rather than remapping its target.
export function WorkspaceEntryLink({
  demo,
  workspace = false,
}: {
  demo: boolean;
  workspace?: boolean;
}) {
  return (
    <Link to={demo ? (workspace ? '/app/businesses' : '/login') : '/demo'}>
      {demo
        ? workspace
          ? 'Leave demo'
          : 'Sign in to your workspace'
        : 'Explore the public demo'}
    </Link>
  );
}
