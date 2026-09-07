export type AppEnvironment = 'local' | 'demo' | 'production';
export type UserRole = 'OWNER' | 'ACCOUNTANT';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface Env {
  APP_ENV: AppEnvironment;
  LOCAL_AUTH_ENABLED: string;
  DEV_OWNER_EMAIL: string;
  DEV_ACCOUNTANT_EMAIL: string;
  DB: D1Database;
  DOCUMENTS: R2Bucket;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}
