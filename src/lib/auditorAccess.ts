export interface AuditorScope {
  scopeType: 'ACCOUNT' | 'BUSINESS' | 'LEGAL_ENTITY';
  businessId: string | null;
  legalEntityId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}
export interface AuditorGrant {
  accessStartsAt: string | null;
  accessExpiresAt: string;
  scopes: AuditorScope[];
  note: string | null;
}
export interface AuditorMember extends AuditorGrant {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'INVITED';
  accessState: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED' | 'INVITED';
  userStatus: 'ACTIVE' | 'DISABLED';
  revision: number;
}
export interface AuditorInvitation extends AuditorGrant {
  id: string;
  email: string;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  revision: number;
}
