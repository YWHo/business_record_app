export interface AuditorAccessDetails {
  accessStartsAt: string | null;
  accessExpiresAt: string;
  scopes: {
    scopeType: 'ACCOUNT' | 'BUSINESS' | 'LEGAL_ENTITY';
    label: string;
    dateFrom: string | null;
    dateTo: string | null;
  }[];
}
