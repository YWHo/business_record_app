import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when);
  const stayButton = useRef<HTMLButtonElement>(null);
  const leaveButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useBeforeUnload(
    (event) => {
      if (!when) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { capture: true },
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    stayButton.current?.focus();
    return () => previousFocus.current?.focus();
  }, [blocker.state]);

  if (blocker.state !== 'blocked') return null;

  function stay() {
    blocker.reset?.();
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stay();
      return;
    }
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === stayButton.current) {
      event.preventDefault();
      leaveButton.current?.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === leaveButton.current
    ) {
      event.preventDefault();
      stayButton.current?.focus();
    }
  }

  return (
    <div className="dialog-backdrop" onKeyDown={keyDown}>
      <section
        aria-describedby="unsaved-changes-description"
        aria-labelledby="unsaved-changes-heading"
        aria-modal="true"
        className="confirm-dialog"
        role="dialog"
      >
        <h2 id="unsaved-changes-heading">Discard unsaved changes?</h2>
        <p id="unsaved-changes-description">
          You have changes that have not been saved. Stay on this page to keep
          editing, or leave and discard them.
        </p>
        <div className="button-row">
          <button ref={stayButton} type="button" onClick={stay}>
            Stay on page
          </button>
          <button
            ref={leaveButton}
            type="button"
            className="danger-button"
            onClick={() => blocker.proceed()}
          >
            Leave without saving
          </button>
        </div>
      </section>
    </div>
  );
}
