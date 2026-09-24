import { describe, expect, it } from 'vitest';
import { matchRoutePattern } from './router';

describe('matchRoutePattern', () => {
  it('matches and decodes named path segments', () => {
    expect(
      matchRoutePattern(
        '/api/businesses/:businessId/expenses',
        '/api/businesses/business%201/expenses',
      ),
    ).toEqual({ params: { businessId: 'business 1' } });
  });

  it('does not match different path shapes', () => {
    expect(
      matchRoutePattern(
        '/api/businesses/:businessId/expenses',
        '/api/businesses/business-1/income',
      ),
    ).toBeNull();
    expect(
      matchRoutePattern(
        '/api/businesses/:businessId',
        '/api/businesses/business-1/expenses',
      ),
    ).toBeNull();
  });

  it('rejects encoded path separators', () => {
    expect(() =>
      matchRoutePattern(
        '/api/businesses/:businessId',
        '/api/businesses/account%2Fother',
      ),
    ).toThrow('request path is invalid');
  });
});
