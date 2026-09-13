import { HttpError } from './http';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

function positiveInteger(value: string | null, fallback: number, name: string) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value))
    throw new HttpError(400, `${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new HttpError(400, `${name} must be a positive integer.`);
  return parsed;
}

export function requestPagination(url: URL): Pagination {
  const page = positiveInteger(url.searchParams.get('page'), 1, 'page');
  const pageSize = positiveInteger(
    url.searchParams.get('pageSize'),
    DEFAULT_PAGE_SIZE,
    'pageSize',
  );
  if (page > MAX_PAGE)
    throw new HttpError(400, `page cannot exceed ${MAX_PAGE}.`);
  if (pageSize > MAX_PAGE_SIZE)
    throw new HttpError(400, `pageSize cannot exceed ${MAX_PAGE_SIZE}.`);
  return {
    page,
    pageSize,
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  };
}

export function pageResult<T>(rows: T[], pagination: Pagination) {
  return {
    items: rows.slice(0, pagination.pageSize),
    page: {
      number: pagination.page,
      size: pagination.pageSize,
      hasNext: rows.length > pagination.pageSize,
    },
  };
}
