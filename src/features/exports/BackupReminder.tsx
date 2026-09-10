import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../auth/AuthContext';

export interface BackupStatus {
  reminderDays: number;
  lastSuccessfulExportAt: string | null;
  due: boolean;
}

export function BackupReminder() {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  useEffect(() => {
    void apiRequest<{ backup: BackupStatus }>('/api/exports/status')
      .then((result) => setBackup(result.backup))
      .catch(() => setBackup(null));
  }, []);
  if (!backup) return null;
  return <BackupReminderView backup={backup} />;
}

export function BackupReminderView({ backup }: { backup: BackupStatus }) {
  return (
    <aside className={`backup-reminder ${backup.due ? 'due' : ''}`}>
      <div>
        <strong>
          {backup.due ? 'Local backup due' : 'Local backup current'}
        </strong>
        <p>
          {backup.lastSuccessfulExportAt
            ? `Last completed ${new Date(backup.lastSuccessfulExportAt).toLocaleString('en-NZ')}.`
            : 'No successful portable export has been recorded yet.'}{' '}
          Reminder interval: {backup.reminderDays} days.
        </p>
      </div>
      <Link className="button-link" to="/exports">
        {backup.due ? 'Back up now' : 'Open exports'}
      </Link>
    </aside>
  );
}
