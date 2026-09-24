/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Outlet } from 'react-router-dom';
import { apiRequest } from '../auth/AuthContext';

export interface BusinessSummary {
  id: string;
  name: string;
  description: string | null;
  businessType: string | null;
  defaultCurrency: string;
  status: 'ACTIVE' | 'INACTIVE';
  legacyBusinessActivityId: string | null;
  currentLegalEntity: {
    id: string;
    entityType:
      'SOLE_TRADER' | 'LIMITED_COMPANY' | 'PARTNERSHIP' | 'TRUST' | 'OTHER';
    legalName: string | null;
    tradingName: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    attributionReviewRequired: boolean;
  } | null;
  recordCount: number;
  lastRecordUpdatedAt: string | null;
}

interface BusinessDirectoryValue {
  businesses: BusinessSummary[];
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
}

const BusinessDirectoryContext = createContext<BusinessDirectoryValue | null>(
  null,
);

export function BusinessDirectoryProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<{ businesses: BusinessSummary[] }>(
        '/api/businesses',
      );
      setBusinesses(result.businesses);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load your businesses.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading the remote directory is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ businesses, error, loading, reload }),
    [businesses, error, loading, reload],
  );

  return (
    <BusinessDirectoryContext.Provider value={value}>
      {children ?? <Outlet />}
    </BusinessDirectoryContext.Provider>
  );
}

export function useBusinessDirectory(): BusinessDirectoryValue {
  const context = useContext(BusinessDirectoryContext);
  if (!context)
    throw new Error(
      'useBusinessDirectory must be used inside BusinessDirectoryProvider.',
    );
  return context;
}
