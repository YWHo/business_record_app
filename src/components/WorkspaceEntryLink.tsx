import { Link } from 'react-router-dom';

// Deliberately crosses the workspace boundary rather than remapping its target.
export function WorkspaceEntryLink({
  demo,
  workspace = false,
  onLeaveDemo,
}: {
  demo: boolean;
  workspace?: boolean;
  onLeaveDemo?: () => void;
}) {
  return (
    <Link
      to={demo ? (workspace ? '/app/businesses' : '/login') : '/demo'}
      onClick={(event) => {
        if (
          demo &&
          workspace &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          onLeaveDemo?.();
        }
      }}
    >
      {demo
        ? workspace
          ? 'Leave demo'
          : 'Sign in to your workspace'
        : 'Explore the public demo'}
    </Link>
  );
}
