import { type FormEvent, useState } from 'react';
import type {
  AuditorGrant,
  AuditorMember,
  AuditorScope,
} from '../../lib/auditorAccess';
import { FormError } from '../../components/FormError';

export interface AccessOption {
  id: string;
  name: string;
}
const emptyScope = (): AuditorScope => ({
  scopeType: 'BUSINESS',
  businessId: null,
  legalEntityId: null,
  dateFrom: null,
  dateTo: null,
});
function localTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function AuditorAccessForm({
  member,
  businesses,
  entities,
  onSubmit,
  onDirtyChange,
}: {
  member?: AuditorMember;
  businesses: AccessOption[];
  entities: AccessOption[];
  onSubmit: (
    value: AuditorGrant & { email: string; restoreAccess: boolean },
  ) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [email, setEmail] = useState(member?.email ?? '');
  const [start, setStart] = useState(localTime(member?.accessStartsAt ?? null));
  const [expiry, setExpiry] = useState(() =>
    localTime(
      member?.accessExpiresAt ??
        new Date(Date.now() + 30 * 86400000).toISOString(),
    ),
  );
  const [scopes, setScopes] = useState<AuditorScope[]>(
    member?.scopes ?? [emptyScope()],
  );
  const [note, setNote] = useState('');
  const [restoreAccess, setRestoreAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function changeScope(index: number, change: Partial<AuditorScope>) {
    setScopes(
      scopes.map((scope, i) => (i === index ? { ...scope, ...change } : scope)),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (
      !expiry ||
      !Number.isFinite(Date.parse(expiry)) ||
      Date.parse(expiry) <= Date.now() ||
      (start && Date.parse(start) >= Date.parse(expiry))
    ) {
      setError('Choose a future expiry after the access start.');
      return;
    }
    if (
      scopes.some(
        (scope) =>
          (scope.scopeType === 'BUSINESS' && !scope.businessId) ||
          (scope.scopeType === 'LEGAL_ENTITY' && !scope.legalEntityId) ||
          (scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo),
      )
    ) {
      setError(
        'Select each scope and use an end date on or after its start date.',
      );
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        email,
        accessStartsAt: start ? new Date(start).toISOString() : null,
        accessExpiresAt: new Date(expiry).toISOString(),
        scopes,
        note: note.trim() || null,
        restoreAccess,
      });
      onDirtyChange?.(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to save auditor access.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="stack-form panel"
      onChange={() => onDirtyChange?.(true)}
      onSubmit={(event) => void submit(event)}
    >
      <p>
        <strong>Auditor · Read-only access</strong>
      </p>
      <p>
        Auditors can read permitted records and preview evidence. They cannot
        change records, comment, review, download files, or export reports.
      </p>
      <label htmlFor="auditor-email">Auditor email</label>
      <input
        id="auditor-email"
        type="email"
        required
        readOnly={!!member}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="auditor-start">
        Access starts (local time, optional)
      </label>
      <input
        id="auditor-start"
        type="datetime-local"
        value={start}
        onChange={(event) => setStart(event.target.value)}
      />
      <label htmlFor="auditor-expiry">Access expires (local time)</label>
      <input
        id="auditor-expiry"
        type="datetime-local"
        required
        value={expiry}
        onChange={(event) => setExpiry(event.target.value)}
      />
      <p>
        Record dates below use New Zealand accounting dates. Access is granted
        when any one scope matches; the dates narrow that scope.
      </p>
      {scopes.map((scope, index) => (
        <fieldset key={index} disabled={saving}>
          <legend>Scope {index + 1}</legend>
          <label htmlFor={`scope-type-${index}`}>Scope type {index + 1}</label>
          <select
            id={`scope-type-${index}`}
            value={scope.scopeType}
            onChange={(event) =>
              changeScope(index, {
                scopeType: event.target.value as AuditorScope['scopeType'],
                businessId: null,
                legalEntityId: null,
              })
            }
          >
            <option value="BUSINESS">Business</option>
            <option value="LEGAL_ENTITY">Legal entity</option>
            <option value="ACCOUNT">Whole account</option>
          </select>
          {scope.scopeType !== 'ACCOUNT' && (
            <>
              <label htmlFor={`scope-target-${index}`}>
                {scope.scopeType === 'BUSINESS' ? 'Business' : 'Legal entity'}{' '}
                {index + 1}
              </label>
              <select
                id={`scope-target-${index}`}
                required
                value={
                  (scope.scopeType === 'BUSINESS'
                    ? scope.businessId
                    : scope.legalEntityId) ?? ''
                }
                onChange={(event) =>
                  changeScope(
                    index,
                    scope.scopeType === 'BUSINESS'
                      ? { businessId: event.target.value }
                      : { legalEntityId: event.target.value },
                  )
                }
              >
                <option value="">Select scope</option>
                {(scope.scopeType === 'BUSINESS' ? businesses : entities).map(
                  (option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ),
                )}
              </select>
            </>
          )}
          <label htmlFor={`scope-from-${index}`}>
            Record dates from {index + 1} (optional)
          </label>
          <input
            id={`scope-from-${index}`}
            type="date"
            value={scope.dateFrom ?? ''}
            onChange={(event) =>
              changeScope(index, { dateFrom: event.target.value || null })
            }
          />
          <label htmlFor={`scope-to-${index}`}>
            Record dates to {index + 1} (optional)
          </label>
          <input
            id={`scope-to-${index}`}
            type="date"
            value={scope.dateTo ?? ''}
            onChange={(event) =>
              changeScope(index, { dateTo: event.target.value || null })
            }
          />
          {scopes.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setScopes(scopes.filter((_, i) => i !== index));
                onDirtyChange?.(true);
              }}
            >
              Remove scope {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        disabled={saving || scopes.length >= 16}
        onClick={() => {
          setScopes([...scopes, emptyScope()]);
          onDirtyChange?.(true);
        }}
      >
        Add scope
      </button>
      <label htmlFor="auditor-note">Reason or note (optional)</label>
      <textarea
        id="auditor-note"
        maxLength={2000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {member && (
        <p>
          Saving changes ends existing sessions. Editing the grant keeps its
          current status unless you explicitly restore access.
        </p>
      )}
      {member &&
        (member.accessState === 'DISABLED' ||
          member.accessState === 'EXPIRED') && (
          <label>
            <input
              type="checkbox"
              checked={restoreAccess}
              disabled={member.userStatus !== 'ACTIVE'}
              onChange={(event) => setRestoreAccess(event.target.checked)}
            />{' '}
            Restore auditor access with this grant
          </label>
        )}
      {member?.userStatus === 'DISABLED' && (
        <p>This identity is disabled. Updating a grant cannot enable it.</p>
      )}
      <FormError message={error} />
      <button type="submit" disabled={saving}>
        {saving
          ? 'Saving…'
          : member
            ? 'Save auditor access'
            : 'Send auditor invitation'}
      </button>
    </form>
  );
}
