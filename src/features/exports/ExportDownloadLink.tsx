import { hasPermission } from '../../lib/permissions';

export function ExportDownloadLink({
  role,
  href,
  onDownload,
}: {
  role: unknown;
  href: string;
  onDownload?: () => void;
}) {
  if (!hasPermission({ role }, 'REPORT_EXPORT'))
    return <p>Report downloads are not enabled for this access.</p>;
  return (
    <a className="button-link" href={href} onClick={onDownload} download>
      {hasPermission({ role }, 'ARCHIVE_EXPORT')
        ? 'Download portable ZIP'
        : 'Download summary CSV'}
    </a>
  );
}
