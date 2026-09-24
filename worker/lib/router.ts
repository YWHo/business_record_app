import { HttpError } from './http';

export type RouteParameters = Readonly<Record<string, string>>;

export interface RouteMatch {
  params: RouteParameters;
}

function decodedSegment(value: string): string {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.includes('/') || decoded.includes('\\')) {
      throw new Error('Invalid path segment.');
    }
    return decoded;
  } catch {
    throw new HttpError(400, 'The request path is invalid.');
  }
}

export function matchRoutePattern(
  pattern: string,
  pathname: string,
): RouteMatch | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodedSegment(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return { params };
}
