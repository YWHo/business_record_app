import { describe, expect, it } from 'vitest';
import { HttpError } from '../lib/http';
import { normalizeEmail } from './invitationService';

describe('normalizeEmail', () => {
  it('normalizes a valid address', () => {
    expect(normalizeEmail('  Person@Example.test ')).toBe(
      'person@example.test',
    );
  });

  it('rejects an invalid address', () => {
    expect(() => normalizeEmail('not-an-email')).toThrow(HttpError);
  });
});
