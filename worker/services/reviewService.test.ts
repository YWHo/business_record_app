import { describe, expect, it } from 'vitest';
import {
  ensureStatusPermission,
  reviewRecordType,
  reviewStatus,
  savedFilterType,
} from './reviewService';

describe('review workflow validation', () => {
  it('allows owners to prepare or void records without assigning review', () => {
    expect(() =>
      ensureStatusPermission('OWNER', 'NEW', 'READY_FOR_REVIEW'),
    ).not.toThrow();
    expect(() =>
      ensureStatusPermission('OWNER', 'NEW', 'VOIDED'),
    ).not.toThrow();
    expect(() =>
      ensureStatusPermission('OWNER', 'READY_FOR_REVIEW', 'REVIEWED'),
    ).toThrow('cannot assign');
  });

  it('allows accountants to review and process but not void records', () => {
    expect(() =>
      ensureStatusPermission('ACCOUNTANT', 'READY_FOR_REVIEW', 'REVIEWED'),
    ).not.toThrow();
    expect(() =>
      ensureStatusPermission('ACCOUNTANT', 'REVIEWED', 'PROCESSED'),
    ).not.toThrow();
    expect(() => ensureStatusPermission('ACCOUNTANT', 'NEW', 'VOIDED')).toThrow(
      'cannot assign',
    );
  });

  it('requires readiness before review and review before processing', () => {
    expect(() =>
      ensureStatusPermission('ACCOUNTANT', 'NEW', 'REVIEWED'),
    ).toThrow('ready for review');
    expect(() =>
      ensureStatusPermission('ACCOUNTANT', 'READY_FOR_REVIEW', 'PROCESSED'),
    ).toThrow('reviewed record');
  });

  it('keeps voided history terminal', () => {
    expect(() => ensureStatusPermission('OWNER', 'VOIDED', 'NEW')).toThrow(
      'final status',
    );
  });

  it('rejects unsupported record, status, and saved-filter types', () => {
    expect(() => reviewRecordType('CLIENT')).toThrow('Record type');
    expect(() => reviewStatus('TRASHED')).toThrow('Status');
    expect(savedFilterType('AUDIT')).toBe('AUDIT');
    expect(() => savedFilterType('EXPORT')).toThrow('Saved filter type');
  });
});
