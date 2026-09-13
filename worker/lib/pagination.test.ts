import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  pageResult,
  requestPagination,
} from './pagination';

describe('bounded API pagination', () => {
  it('applies a bounded default and detects another page', () => {
    const pagination = requestPagination(new URL('https://example.test/api'));
    expect(pagination).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      limit: DEFAULT_PAGE_SIZE + 1,
      offset: 0,
    });
    const result = pageResult(
      Array(DEFAULT_PAGE_SIZE + 1).fill('row'),
      pagination,
    );
    expect(result.items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(result.page).toEqual({
      number: 1,
      size: DEFAULT_PAGE_SIZE,
      hasNext: true,
    });
  });

  it('caps caller-controlled page size and page depth', () => {
    expect(() =>
      requestPagination(
        new URL(`https://example.test/api?pageSize=${MAX_PAGE_SIZE + 1}`),
      ),
    ).toThrow(`pageSize cannot exceed ${MAX_PAGE_SIZE}.`);
    expect(() =>
      requestPagination(new URL('https://example.test/api?page=101')),
    ).toThrow('page cannot exceed 100.');
  });
});
