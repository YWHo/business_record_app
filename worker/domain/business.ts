export type BusinessStatus = 'ACTIVE' | 'INACTIVE';

export type LegalEntityType =
  'SOLE_TRADER' | 'LIMITED_COMPANY' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';

export interface Business {
  id: string;
  businessAccountId: string;
  name: string;
  description: string | null;
  businessType: string | null;
  defaultCurrency: string;
  status: BusinessStatus;
  legacyBusinessActivityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LegalEntity {
  id: string;
  businessAccountId: string;
  entityType: LegalEntityType;
  legalName: string | null;
  tradingName: string | null;
  nzbn: string | null;
  companyNumber: string | null;
  country: string;
  status: BusinessStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessEntityPeriod {
  id: string;
  businessAccountId: string;
  businessId: string;
  legalEntityId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: string;
  notes: string | null;
}

export interface CreateBusinessInput {
  id: string;
  businessAccountId: string;
  name: string;
  description: string | null;
  businessType: string | null;
  defaultCurrency: string;
  status: BusinessStatus;
  legacyBusinessActivityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLegalEntityInput {
  id: string;
  businessAccountId: string;
  entityType: LegalEntityType;
  legalName: string;
  tradingName: string | null;
  nzbn: string | null;
  companyNumber: string | null;
  country: string;
  status: BusinessStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBusinessEntityPeriodInput {
  id: string;
  businessAccountId: string;
  businessId: string;
  legalEntityId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: string;
  notes: string | null;
}
