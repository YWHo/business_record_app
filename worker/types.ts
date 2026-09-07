export type AppEnvironment = 'local' | 'demo' | 'production';
export type UserRole = 'OWNER' | 'ACCOUNTANT';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface Env {
  APP_ENV: AppEnvironment;
  LOCAL_AUTH_ENABLED: string;
  DEV_OWNER_EMAIL: string;
  DEV_ACCOUNTANT_EMAIL: string;
  DEV_BOOTSTRAP_KEY: string;
  APP_ORIGIN: string;
  TURNSTILE_REQUIRED: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_DELIVERY_URL: string;
  EMAIL_DELIVERY_BEARER_TOKEN?: string;
  EMAIL_FROM: string;
  BOOTSTRAP_OWNER_EMAIL?: string;
  BOOTSTRAP_ADMIN_KEY?: string;
  AUTH_RATE_LIMITER: RateLimiter;
  INVITE_RATE_LIMITER: RateLimiter;
  DB: D1Database;
  DOCUMENTS: R2Bucket;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}
